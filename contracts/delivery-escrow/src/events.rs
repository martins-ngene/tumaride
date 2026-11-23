use soroban_sdk::{contractevent, Address};

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowFundedEvent {
    #[topic]
    pub delivery_id: u64,
    pub customer: Address,
    pub rider: Option<Address>,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RiderAssignedEvent {
    #[topic]
    pub delivery_id: u64,
    pub rider: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DeliveryCompletedEvent {
    #[topic]
    pub delivery_id: u64,
    pub rider: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentReleasedEvent {
    #[topic]
    pub delivery_id: u64,
    pub customer: Address,
    pub rider: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowRefundedEvent {
    #[topic]
    pub delivery_id: u64,
    pub customer: Address,
    pub amount: i128,
}
