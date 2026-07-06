import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface WhatsAppHealth {
  phoneNumber: string | null;
  phoneName: string | null;
  businessName: string | null;
  businessNameStatus: 'ACCEPTED' | 'REJECTED' | 'PENDING' | null;
  qualityRating: 'GREEN' | 'YELLOW' | 'RED' | null;
  accountMode: 'LIVE' | 'DEVELOPMENT' | null;
  codeVerificationStatus: 'VERIFIED' | 'NOT_VERIFIED' | null;
  webhookConfigured: boolean;
  webhookValid: boolean;
  lastFetched: string;
}

@Injectable()
export class WhatsAppHealthService {
  private readonly logger = new Logger(WhatsAppHealthService.name);
  private readonly GRAPH_API = 'https://graph.facebook.com/v25.0';

  async getHealth(config: Record<string, any>): Promise<WhatsAppHealth> {
    const phoneNumberId = config.phoneNumberId;
    const accessToken = config.accessToken;

    if (!phoneNumberId || !accessToken) {
      return {
        phoneNumber: null, phoneName: null, businessName: null,
        businessNameStatus: null, qualityRating: null,
        accountMode: null, codeVerificationStatus: null,
        webhookConfigured: false, webhookValid: false,
        lastFetched: new Date().toISOString(),
      };
    }

    const result: WhatsAppHealth = {
      phoneNumber: null, phoneName: null, businessName: null,
      businessNameStatus: null, qualityRating: null,
      accountMode: null, codeVerificationStatus: null,
      webhookConfigured: false, webhookValid: false,
      lastFetched: new Date().toISOString(),
    };

    try {
      // 1. Phone Number details
      const phoneRes = await axios.get(`${this.GRAPH_API}/${phoneNumberId}`, {
        params: {
          access_token: accessToken,
          fields: 'display_phone_number,verified_name,code_verification_status,quality_rating,account_mode',
        },
        timeout: 10000,
      });
      result.phoneNumber = phoneRes.data.display_phone_number ?? null;
      result.phoneName = phoneRes.data.verified_name ?? null;
      result.qualityRating = phoneRes.data.quality_rating ?? null;
      result.accountMode = phoneRes.data.account_mode ?? null;
      result.codeVerificationStatus = phoneRes.data.code_verification_status ?? null;
    } catch (err: any) {
      this.logger.warn(`Failed to fetch phone number details: ${err?.message}`);
    }

    // 2. Business profile (WABA)
    const wabaId = config.businessAccountId;
    if (wabaId) {
      try {
        const bizRes = await axios.get(`${this.GRAPH_API}/${wabaId}`, {
          params: {
            access_token: accessToken,
            fields: 'name,account_status,on_behalf_of_business_info',
          },
          timeout: 10000,
        });
        result.businessName = bizRes.data.name ?? null;
        // on_behalf_of_business_info has verification status
        if (bizRes.data.on_behalf_of_business_info?.verification_status) {
          result.businessNameStatus = bizRes.data.on_behalf_of_business_info.verification_status;
        }
      } catch (err: any) {
        this.logger.warn(`Failed to fetch WABA details: ${err?.message}`);
      }
    }

    // 3. Check webhook subscription
    try {
      const subRes = await axios.get(`${this.GRAPH_API}/${phoneNumberId}/subscribed_apps`, {
        params: { access_token: accessToken },
        timeout: 10000,
      });
      const data = subRes.data?.data?.[0] ?? subRes.data;
      result.webhookConfigured = !!data;
      result.webhookValid = data?.status === 'ENABLED' || data?.status === 'ACTIVE';
    } catch {
      result.webhookConfigured = false;
      result.webhookValid = false;
    }

    return result;
  }
}
