import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIG_TOKEN, type AppConfig } from '../config/env';

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Delivery abstraction for the two transactional emails the product sends
 * (invitations and password resets).
 *
 * Development and test builds log the message instead of sending it — the links
 * are printed in full so the flow is testable end to end without an email
 * provider or an API key in the repository. Wiring a real provider means
 * implementing `deliver` against its SDK; nothing else changes.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly sent: OutboundEmail[] = [];

  constructor(@Inject(CONFIG_TOKEN) private readonly config: AppConfig) {}

  async sendInvitation(params: {
    to: string;
    workspaceName: string;
    inviterName: string;
    acceptUrl: string;
  }): Promise<void> {
    await this.deliver({
      to: params.to,
      subject: `${params.inviterName} invited you to ${params.workspaceName} on FlowSync`,
      text: [
        `${params.inviterName} invited you to collaborate in the "${params.workspaceName}" workspace.`,
        '',
        `Accept the invitation: ${params.acceptUrl}`,
        '',
        'This link expires in 7 days and can be used once.',
      ].join('\n'),
    });
  }

  async sendPasswordReset(params: { to: string; resetUrl: string }): Promise<void> {
    await this.deliver({
      to: params.to,
      subject: 'Reset your FlowSync password',
      text: [
        'We received a request to reset your FlowSync password.',
        '',
        `Reset it here: ${params.resetUrl}`,
        '',
        'The link expires in one hour. If this was not you, no action is needed.',
      ].join('\n'),
    });
  }

  /** Test helper: the messages this process would have sent. */
  outbox(): readonly OutboundEmail[] {
    return this.sent;
  }

  clearOutbox(): void {
    this.sent.length = 0;
  }

  private async deliver(email: OutboundEmail): Promise<void> {
    this.sent.push(email);
    if (this.sent.length > 100) this.sent.shift();

    if (!this.config.isTest) {
      this.logger.log(
        { to: email.to, subject: email.subject },
        `Email (console transport)\n${email.text}`,
      );
    }
  }
}
