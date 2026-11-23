use soroban_sdk::{contracttype, Address, BytesN};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EscrowStatus {
    Funded = 1,
    Delivered = 2,
    Released = 3,
    Refunded = 4,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractConfig {
    pub admin: Address,
    pub usdc_token: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowRecord {
    pub delivery_id: u64,
    pub customer: Address,
    pub rider: Option<Address>,
    pub amount: i128,
    pub status: EscrowStatus,
    pub confirmation_hash: BytesN<32>,
    pub created_at: u64,
    pub settled_at: Option<u64>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Config,
    Escrow(u64),
}
