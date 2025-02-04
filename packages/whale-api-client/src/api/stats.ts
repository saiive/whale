import { BigNumber } from 'bignumber.js'
import { WhaleApiClient } from '../whale.api.client'

export class Stats {
  constructor(private readonly client: WhaleApiClient) {
  }

  /**
   * Get stats of DeFi Blockchain
   *
   * @return {Promise<StatsData>}
   */
  async get(): Promise<StatsData> {
    return await this.client.requestData('GET', 'stats')
  }
}

/**
 * Stats data, doesn't use BigNumber is precision is not expected.
 */
export interface StatsData {
  count: {
    blocks: number
    tokens: number
    prices: number
    masternodes: number
  }
  tvl: {
    total: number
    dex: number
    masternodes: number
  }
  burned: {
    total: number
    fee: number
    emission: number
    address: number
  }
  price: {
    usdt: number
  }
  masternodes: {
    locked: Array<{ weeks: number, tvl: number, count: number }>
  }
  rewards: {
    daily: BigNumber | undefined
  }
  emission: {
    total: number
    masternode: number
    dex: number
    community: number
    anchor: number
    burned: number
  }
  blockchain: {
    difficulty: number
  }
}
