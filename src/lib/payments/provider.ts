/** Provider-neutral boundary. Implementations belong in server-only provider adapters. */
export interface AcceptedPaymentRequest {
  appointmentId: string;
  amountMinor: number;
  currency: string;
  deadline: string;
  idempotencyKey: string;
  serviceName: string;
  publicReference: string;
}

export type VerifiedProviderPayment = {
  eventId: string;
  reference: string;
  paidAt: string;
  amountMinor: number;
  currency: string;
};

export type ProviderWebhookResult = VerifiedProviderPayment | { ignored: true };

export interface PaymentProvider {
  /** Stable server-side provider identifier; never supplied by a browser. */
  readonly id: string;
  createCheckout(request: AcceptedPaymentRequest): Promise<{ reference: string; url: string }>;
  getPaymentStatus(reference: string): Promise<VerifiedProviderPayment | { state: "PENDING" | "FAILED" | "CANCELLED" }>;
  /** Verify authenticity against the original request bytes before returning normalized facts. */
  verifyWebhook(rawBody: Uint8Array, headers: Headers): Promise<ProviderWebhookResult>;
  refundPayment(request: {
    reference: string;
    amountMinor: number;
    idempotencyKey: string;
    reason: string;
  }): Promise<{ reference: string; state: "PENDING" | "SUCCEEDED" | "FAILED" }>;
}
