#![no_std]

mod errors;
mod events;
mod types;

use soroban_sdk::{contract, contractimpl, token, Address, Bytes, BytesN, Env};

pub use errors::EscrowError;
pub use events::{
    DeliveryCompletedEvent, EscrowFundedEvent, EscrowRefundedEvent, PaymentReleasedEvent,
    RiderAssignedEvent,
};
pub use types::{ContractConfig, DataKey, EscrowRecord, EscrowStatus};

#[contract]
pub struct DeliveryEscrowContract;

#[contractimpl]
impl DeliveryEscrowContract {
    /// Initialize the delivery escrow contract with admin and simulated USDC token address.
    pub fn initialize(
        env: Env,
        admin: Address,
        usdc_token: Address,
    ) -> Result<(), EscrowError> {
        if env.storage().instance().has(&DataKey::Config) {
            return Err(EscrowError::AlreadyInitialized);
        }
        admin.require_auth();

        let config = ContractConfig { admin, usdc_token };
        env.storage().instance().set(&DataKey::Config, &config);
        Ok(())
    }

    /// Lock delivery fees in Soroban escrow using simulated USDC.
    pub fn fund_escrow(
        env: Env,
        delivery_id: u64,
        customer: Address,
        rider: Option<Address>,
        amount: i128,
        confirmation_hash: BytesN<32>,
    ) -> Result<EscrowRecord, EscrowError> {
        let config = Self::read_config(&env)?;
        customer.require_auth();

        if amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }
        if env
            .storage()
            .persistent()
            .has(&DataKey::Escrow(delivery_id))
        {
            return Err(EscrowError::DeliveryAlreadyExists);
        }
        if let Some(ref r) = rider {
            if r == &customer {
                return Err(EscrowError::CustomerCannotBeRider);
            }
        }

        let contract_addr = env.current_contract_address();
        let token_client = token::Client::new(&env, &config.usdc_token);
        token_client.transfer(&customer, &contract_addr, &amount);

        let record = EscrowRecord {
            delivery_id,
            customer: customer.clone(),
            rider: rider.clone(),
            amount,
            status: EscrowStatus::Funded,
            confirmation_hash,
            created_at: env.ledger().timestamp(),
            settled_at: None,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Escrow(delivery_id), &record);

        EscrowFundedEvent {
            delivery_id,
            customer,
            rider,
            amount,
        }
        .publish(&env);

        Ok(record)
    }

    /// Assign or accept a rider for a funded delivery that does not yet have a rider.
    pub fn assign_rider(
        env: Env,
        delivery_id: u64,
        actor: Address,
        rider: Address,
    ) -> Result<EscrowRecord, EscrowError> {
        let _ = Self::read_config(&env)?;
        actor.require_auth();

        let mut record = Self::read_escrow(&env, delivery_id)?;

        if record.status == EscrowStatus::Released || record.status == EscrowStatus::Refunded {
            return Err(EscrowError::AlreadySettled);
        }
        if record.status != EscrowStatus::Funded {
            return Err(EscrowError::InvalidStatusTransition);
        }
        if record.rider.is_some() {
            return Err(EscrowError::RiderAlreadyAssigned);
        }
        if rider == record.customer {
            return Err(EscrowError::CustomerCannotBeRider);
        }
        if actor != record.customer && actor != rider {
            return Err(EscrowError::UnauthorizedActor);
        }

        record.rider = Some(rider.clone());
        env.storage()
            .persistent()
            .set(&DataKey::Escrow(delivery_id), &record);

        RiderAssignedEvent { delivery_id, rider }.publish(&env);

        Ok(record)
    }

    /// Rider marks an assigned delivery as completed/delivered.
    pub fn mark_delivered(env: Env, delivery_id: u64) -> Result<EscrowRecord, EscrowError> {
        let _ = Self::read_config(&env)?;
        let mut record = Self::read_escrow(&env, delivery_id)?;

        if record.status == EscrowStatus::Released || record.status == EscrowStatus::Refunded {
            return Err(EscrowError::AlreadySettled);
        }
        if record.status != EscrowStatus::Funded {
            return Err(EscrowError::InvalidStatusTransition);
        }

        let rider = record.rider.clone().ok_or(EscrowError::RiderNotAssigned)?;
        rider.require_auth();

        record.status = EscrowStatus::Delivered;
        env.storage()
            .persistent()
            .set(&DataKey::Escrow(delivery_id), &record);

        DeliveryCompletedEvent { delivery_id, rider }.publish(&env);

        Ok(record)
    }

    /// Customer confirms delivery with the unique confirmation code and releases escrow payment to rider.
    pub fn confirm_and_release(
        env: Env,
        delivery_id: u64,
        confirmation_code: Bytes,
    ) -> Result<EscrowRecord, EscrowError> {
        let config = Self::read_config(&env)?;
        let mut record = Self::read_escrow(&env, delivery_id)?;

        // Duplicate settlement guard
        if record.status == EscrowStatus::Released || record.status == EscrowStatus::Refunded {
            return Err(EscrowError::AlreadySettled);
        }
        if record.status != EscrowStatus::Delivered {
            return Err(EscrowError::InvalidStatusTransition);
        }

        record.customer.require_auth();

        let rider = record.rider.clone().ok_or(EscrowError::RiderNotAssigned)?;

        let provided_hash: BytesN<32> = env.crypto().sha256(&confirmation_code).into();
        if provided_hash != record.confirmation_hash {
            return Err(EscrowError::InvalidConfirmationCode);
        }

        // State-before-transfer guard against reentrancy & duplicate settlement
        record.status = EscrowStatus::Released;
        record.settled_at = Some(env.ledger().timestamp());
        env.storage()
            .persistent()
            .set(&DataKey::Escrow(delivery_id), &record);

        let contract_addr = env.current_contract_address();
        let token_client = token::Client::new(&env, &config.usdc_token);
        token_client.transfer(&contract_addr, &rider, &record.amount);

        PaymentReleasedEvent {
            delivery_id,
            customer: record.customer.clone(),
            rider,
            amount: record.amount,
        }
        .publish(&env);

        Ok(record)
    }

    /// Cancel an eligible (not yet delivered or settled) delivery and refund USDC to customer.
    pub fn cancel_and_refund(env: Env, delivery_id: u64) -> Result<EscrowRecord, EscrowError> {
        let config = Self::read_config(&env)?;
        let mut record = Self::read_escrow(&env, delivery_id)?;

        // Duplicate settlement guard
        if record.status == EscrowStatus::Released || record.status == EscrowStatus::Refunded {
            return Err(EscrowError::AlreadySettled);
        }
        // Only Funded deliveries are eligible for cancellation & refund
        if record.status != EscrowStatus::Funded {
            return Err(EscrowError::CancellationNotEligible);
        }

        record.customer.require_auth();

        // State-before-transfer guard against reentrancy & duplicate settlement
        record.status = EscrowStatus::Refunded;
        record.settled_at = Some(env.ledger().timestamp());
        env.storage()
            .persistent()
            .set(&DataKey::Escrow(delivery_id), &record);

        let contract_addr = env.current_contract_address();
        let token_client = token::Client::new(&env, &config.usdc_token);
        token_client.transfer(&contract_addr, &record.customer, &record.amount);

        EscrowRefundedEvent {
            delivery_id,
            customer: record.customer.clone(),
            amount: record.amount,
        }
        .publish(&env);

        Ok(record)
    }

    /// Read an escrow record by delivery ID.
    pub fn get_escrow(env: Env, delivery_id: u64) -> Result<EscrowRecord, EscrowError> {
        Self::read_escrow(&env, delivery_id)
    }

    /// Read contract configuration.
    pub fn get_config(env: Env) -> Result<ContractConfig, EscrowError> {
        Self::read_config(&env)
    }

    fn read_config(env: &Env) -> Result<ContractConfig, EscrowError> {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(EscrowError::NotInitialized)
    }

    fn read_escrow(env: &Env, delivery_id: u64) -> Result<EscrowRecord, EscrowError> {
        env.storage()
            .persistent()
            .get(&DataKey::Escrow(delivery_id))
            .ok_or(EscrowError::DeliveryNotFound)
    }
}

#[cfg(test)]
mod test;
