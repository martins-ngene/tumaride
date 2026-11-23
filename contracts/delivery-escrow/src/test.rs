#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::Address as _,
    token::{Client as TokenClient, StellarAssetClient},
    Address, Bytes, BytesN, Env,
};

struct TestContext<'a> {
    env: Env,
    admin: Address,
    customer: Address,
    rider: Address,
    stranger: Address,
    token_id: Address,
    client: DeliveryEscrowContractClient<'a>,
}

fn setup<'a>(env: &'a Env) -> (Address, Address, Address, Address, Address, DeliveryEscrowContractClient<'a>) {
    env.mock_all_auths();

    let admin = Address::generate(env);
    let customer = Address::generate(env);
    let rider = Address::generate(env);
    let stranger = Address::generate(env);

    let token_admin = Address::generate(env);
    let token_contract = env.register_stellar_asset_contract_v2(token_admin);
    let token_id = token_contract.address();

    let stellar_asset = StellarAssetClient::new(env, &token_id);
    stellar_asset.mint(&customer, &100_000_0000); // 1,000 USDC (7 decimals)

    let contract_id = env.register(DeliveryEscrowContract, ());
    let client = DeliveryEscrowContractClient::new(env, &contract_id);
    client.initialize(&admin, &token_id);

    (admin, customer, rider, stranger, token_id, client)
}

fn hash_code(env: &Env, code: &str) -> (Bytes, BytesN<32>) {
    let bytes = Bytes::from_slice(env, code.as_bytes());
    let hash: BytesN<32> = env.crypto().sha256(&bytes).into();
    (bytes, hash)
}

#[test]
fn test_initialize_and_prevent_reinitialization() {
    let env = Env::default();
    let (admin, _, _, _, token_id, client) = setup(&env);

    let cfg = client.get_config();
    assert_eq!(cfg.admin, admin);
    assert_eq!(cfg.usdc_token, token_id);

    let res = client.try_initialize(&admin, &token_id);
    assert_eq!(res, Err(Ok(EscrowError::AlreadyInitialized)));
}

#[test]
fn test_fund_assign_deliver_confirm_and_release_happy_path() {
    let env = Env::default();
    let (_, customer, rider, _, token_id, client) = setup(&env);
    let token = TokenClient::new(&env, &token_id);

    let fee: i128 = 15_0000000; // 15 USDC
    let (code_bytes, code_hash) = hash_code(&env, "TUMA-849201");

    // 1. Customer funds escrow (unassigned rider)
    let funded = client.fund_escrow(&1u64, &customer, &None, &fee, &code_hash);
    assert_eq!(funded.status, EscrowStatus::Funded);
    assert_eq!(funded.amount, fee);
    assert_eq!(funded.rider, None);
    assert_eq!(token.balance(&client.address), fee);

    // 2. Rider accepts delivery
    let assigned = client.assign_rider(&1u64, &rider, &rider);
    assert_eq!(assigned.rider, Some(rider.clone()));

    // 3. Rider marks delivery as completed
    let delivered = client.mark_delivered(&1u64);
    assert_eq!(delivered.status, EscrowStatus::Delivered);

    // 4. Customer confirms with unique code -> payment released to rider
    let released = client.confirm_and_release(&1u64, &code_bytes);
    assert_eq!(released.status, EscrowStatus::Released);
    assert!(released.settled_at.is_some());
    assert_eq!(token.balance(&client.address), 0);
    assert_eq!(token.balance(&rider), fee);
}

#[test]
fn test_reject_invalid_amount_and_duplicate_delivery_id() {
    let env = Env::default();
    let (_, customer, rider, _, _, client) = setup(&env);
    let (_, code_hash) = hash_code(&env, "CODE-1");

    let zero_res = client.try_fund_escrow(&10u64, &customer, &Some(rider.clone()), &0, &code_hash);
    assert_eq!(zero_res, Err(Ok(EscrowError::InvalidAmount)));

    client.fund_escrow(&10u64, &customer, &Some(rider.clone()), &5_0000000, &code_hash);
    let dup_res = client.try_fund_escrow(&10u64, &customer, &Some(rider), &5_0000000, &code_hash);
    assert_eq!(dup_res, Err(Ok(EscrowError::DeliveryAlreadyExists)));
}

#[test]
fn test_reject_customer_as_rider() {
    let env = Env::default();
    let (_, customer, _, _, _, client) = setup(&env);
    let (_, code_hash) = hash_code(&env, "CODE-SELF");

    let res = client.try_fund_escrow(&20u64, &customer, &Some(customer.clone()), &5_0000000, &code_hash);
    assert_eq!(res, Err(Ok(EscrowError::CustomerCannotBeRider)));
}

#[test]
fn test_reject_unauthorized_rider_assignment_and_double_assignment() {
    let env = Env::default();
    let (_, customer, rider, stranger, _, client) = setup(&env);
    let (_, code_hash) = hash_code(&env, "CODE-ASSIGN");

    client.fund_escrow(&30u64, &customer, &None, &10_0000000, &code_hash);

    // Stranger cannot assign rider
    let unauth = client.try_assign_rider(&30u64, &stranger, &rider);
    assert_eq!(unauth, Err(Ok(EscrowError::UnauthorizedActor)));

    // Customer assigns rider
    client.assign_rider(&30u64, &customer, &rider);

    // Second assignment rejected
    let dup_assign = client.try_assign_rider(&30u64, &customer, &stranger);
    assert_eq!(dup_assign, Err(Ok(EscrowError::RiderAlreadyAssigned)));
}

#[test]
fn test_reject_mark_delivered_without_rider() {
    let env = Env::default();
    let (_, customer, _, _, _, client) = setup(&env);
    let (_, code_hash) = hash_code(&env, "CODE-NORIDER");

    client.fund_escrow(&40u64, &customer, &None, &10_0000000, &code_hash);
    let res = client.try_mark_delivered(&40u64);
    assert_eq!(res, Err(Ok(EscrowError::RiderNotAssigned)));
}

#[test]
fn test_reject_invalid_confirmation_code_and_premature_release() {
    let env = Env::default();
    let (_, customer, rider, _, token_id, client) = setup(&env);
    let token = TokenClient::new(&env, &token_id);
    let (valid_code, code_hash) = hash_code(&env, "TUMA-SECRET-99");
    let (wrong_code, _) = hash_code(&env, "TUMA-WRONG-00");

    let fee = 12_0000000;
    client.fund_escrow(&50u64, &customer, &Some(rider.clone()), &fee, &code_hash);

    // Premature release before mark_delivered fails
    let premature = client.try_confirm_and_release(&50u64, &valid_code);
    assert_eq!(premature, Err(Ok(EscrowError::InvalidStatusTransition)));

    client.mark_delivered(&50u64);

    // Wrong confirmation code fails and funds stay locked
    let wrong = client.try_confirm_and_release(&50u64, &wrong_code);
    assert_eq!(wrong, Err(Ok(EscrowError::InvalidConfirmationCode)));
    assert_eq!(token.balance(&client.address), fee);
    assert_eq!(token.balance(&rider), 0);

    // Valid code succeeds
    client.confirm_and_release(&50u64, &valid_code);
    assert_eq!(token.balance(&rider), fee);
}

#[test]
fn test_reject_duplicate_settlement_release() {
    let env = Env::default();
    let (_, customer, rider, _, token_id, client) = setup(&env);
    let token = TokenClient::new(&env, &token_id);
    let (code_bytes, code_hash) = hash_code(&env, "TUMA-ONCE");

    let fee = 20_0000000;
    client.fund_escrow(&60u64, &customer, &Some(rider.clone()), &fee, &code_hash);
    client.mark_delivered(&60u64);
    client.confirm_and_release(&60u64, &code_bytes);

    // Duplicate release attempt must be rejected
    let dup_release = client.try_confirm_and_release(&60u64, &code_bytes);
    assert_eq!(dup_release, Err(Ok(EscrowError::AlreadySettled)));

    // Refund after release must also be rejected
    let refund_after_release = client.try_cancel_and_refund(&60u64);
    assert_eq!(refund_after_release, Err(Ok(EscrowError::AlreadySettled)));
    assert_eq!(token.balance(&rider), fee);
}

#[test]
fn test_eligible_cancellation_and_refund_and_duplicate_refund_rejection() {
    let env = Env::default();
    let (_, customer, rider, _, token_id, client) = setup(&env);
    let token = TokenClient::new(&env, &token_id);
    let (code_bytes, code_hash) = hash_code(&env, "TUMA-CANCEL");

    let initial_balance = token.balance(&customer);
    let fee = 25_0000000;

    client.fund_escrow(&70u64, &customer, &Some(rider), &fee, &code_hash);
    assert_eq!(token.balance(&customer), initial_balance - fee);

    // Eligible cancellation while Funded -> full refund
    let refunded = client.cancel_and_refund(&70u64);
    assert_eq!(refunded.status, EscrowStatus::Refunded);
    assert!(refunded.settled_at.is_some());
    assert_eq!(token.balance(&customer), initial_balance);
    assert_eq!(token.balance(&client.address), 0);

    // Duplicate refund rejected
    let dup_refund = client.try_cancel_and_refund(&70u64);
    assert_eq!(dup_refund, Err(Ok(EscrowError::AlreadySettled)));

    // Release after refund rejected
    let release_after_refund = client.try_confirm_and_release(&70u64, &code_bytes);
    assert_eq!(release_after_refund, Err(Ok(EscrowError::AlreadySettled)));
}

#[test]
fn test_ineligible_cancellation_after_delivery_completed() {
    let env = Env::default();
    let (_, customer, rider, _, _, client) = setup(&env);
    let (_, code_hash) = hash_code(&env, "TUMA-DONE");

    client.fund_escrow(&80u64, &customer, &Some(rider), &18_0000000, &code_hash);
    client.mark_delivered(&80u64);

    // Once rider marks delivered, customer cannot unilaterally cancel/refund
    let cancel_res = client.try_cancel_and_refund(&80u64);
    assert_eq!(cancel_res, Err(Ok(EscrowError::CancellationNotEligible)));
}
