import { WhaleApiClient } from '../whale.api.client'

/**
 * DeFi whale endpoint for oracle related services.
 */
export class Oracle {
  constructor (private readonly client: WhaleApiClient) {
  }

  /**
   * Get current aggregated weightage of an oracle
   *
   * @param {string} oracleId
   * @return {Promise<OracleStatusAggregration>}
   */
  async getAggregation (oracleId: string): Promise<OracleStatusAggregration> {
    return await this.client.requestData('GET', `oracle/${oracleId}/aggregation`)
  }
}

export interface OracleStatusAggregration{
  id: string // oracleId
  block: {
    height: number
  }
  data: {
    weightage: number
  }
  state: OracleState
}

export enum OracleState {
  LIVE = 'LIVE',
  REMOVED = 'REMOVED'
}
