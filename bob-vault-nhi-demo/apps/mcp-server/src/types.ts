export type EventStage =
  "transport" | "identity" | "vault" | "database" | "policy";
export type EventStatus = "allowed" | "denied" | "error" | "ok";

export interface SecurityEvent {
  id: string;
  at: string;
  stage: EventStage;
  status: EventStatus;
  action: string;
  requestId: string;
  latencyMs?: number;
}

export interface OrderStatus {
  order_id: string;
  payment_status: string;
  delivery_status: string;
  updated_at: string;
}

export interface OrderStatusResult extends OrderStatus {
  access: {
    nhi: string;
    user_subject?: string;
    verify: "authenticated";
    vault: "authorized";
    credential_type: "dynamic";
    credential_ttl_seconds: number;
  };
}

export interface FailedPaymentSummary {
  date: string;
  failed_count: number;
  by_delivery_status: {
    delivery_status: string;
    count: number;
  }[];
}

export interface FailedPaymentSummaryResult extends FailedPaymentSummary {
  access: {
    nhi: string;
    user_subject?: string;
    verify: "authenticated";
    vault: "authorized";
    credential_type: "dynamic";
    credential_ttl_seconds: number;
  };
}

export interface SensitivePaymentDenial {
  status: "denied";
  authentication: "successful";
  authorization: "denied";
  reason: string;
}

export interface DynamicDatabaseCredentials {
  username: string;
  password: string;
  leaseId: string;
  leaseDurationSeconds: number;
}

export interface VaultSession {
  clientToken: string;
  renewable: boolean;
  leaseDurationSeconds: number;
}
