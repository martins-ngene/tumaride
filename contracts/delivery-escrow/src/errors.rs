use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum EscrowError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    DeliveryAlreadyExists = 4,
    DeliveryNotFound = 5,
    RiderAlreadyAssigned = 6,
    RiderNotAssigned = 7,
    CustomerCannotBeRider = 8,
    UnauthorizedActor = 9,
    InvalidStatusTransition = 10,
    InvalidConfirmationCode = 11,
    AlreadySettled = 12,
    CancellationNotEligible = 13,
}
