import { DfTxIndexer, DfTxTransaction } from '@src/module.indexer/model/dftx/_abstract'
import { CUpdateOracle, UpdateOracle } from '@defichain/jellyfish-transaction'
import { RawBlock } from '@src/module.indexer/model/_abstract'
import { Injectable } from '@nestjs/common'
import { OracleMapper } from '@src/module.model/oracle'
import { OracleHistory, OracleHistoryMapper } from '@src/module.model/oracle.history'
import { OracleTokenCurrencyMapper } from '@src/module.model/oracle.token.currency'
import { NotFoundIndexerError } from '@src/module.indexer/error'
import { HexEncoder } from '@src/module.model/_hex.encoder'

@Injectable()
export class UpdateOracleIndexer extends DfTxIndexer<UpdateOracle> {
  OP_CODE: number = CUpdateOracle.OP_CODE

  constructor (
    private readonly oracleMapper: OracleMapper,
    private readonly oracleHistoryMapper: OracleHistoryMapper,
    private readonly oracleTokenCurrencyMapper: OracleTokenCurrencyMapper
  ) {
    super()
  }

  async index (block: RawBlock, txns: Array<DfTxTransaction<UpdateOracle>>): Promise<void> {
    for (const { txn, dftx: { data } } of txns) {
      await this.oracleMapper.put({
        id: data.oracleId,
        weightage: data.weightage,
        priceFeeds: data.priceFeeds,
        block: { hash: block.hash, height: block.height, medianTime: block.mediantime, time: block.time }
      })

      const previous = await this.getPrevious(data.oracleId)
      for (const { token, currency } of previous.priceFeeds) {
        await this.oracleTokenCurrencyMapper.delete(`${token}-${currency}-${data.oracleId}`)
      }

      for (const { token, currency } of data.priceFeeds) {
        await this.oracleTokenCurrencyMapper.put({
          id: `${token}-${currency}-${data.oracleId}`,
          key: `${token}-${currency}`,
          oracleId: data.oracleId,
          token: token,
          currency: currency,
          weightage: data.weightage,
          block: { hash: block.hash, height: block.height, medianTime: block.mediantime, time: block.time }
        })
      }

      await this.oracleHistoryMapper.put({
        id: `${data.oracleId}-${block.height}-${txn.txid}`,
        sort: HexEncoder.encodeHeight(block.height) + txn.txid,
        oracleId: data.oracleId,
        weightage: data.weightage,
        priceFeeds: data.priceFeeds,
        block: { hash: block.hash, height: block.height, medianTime: block.mediantime, time: block.time }
      })
    }
  }

  async invalidate (block: RawBlock, txns: Array<DfTxTransaction<UpdateOracle>>): Promise<void> {
    for (const { txn, dftx: { data } } of txns) {
      await this.oracleHistoryMapper.delete(`${data.oracleId}-${block.height}-${txn.txid}`)

      for (const { token, currency } of data.priceFeeds) {
        await this.oracleTokenCurrencyMapper.delete(`${token}-${currency}-${data.oracleId}`)
      }

      const previous = await this.getPrevious(data.oracleId)

      await this.oracleMapper.put({
        id: previous.oracleId,
        weightage: previous.weightage,
        priceFeeds: previous.priceFeeds,
        block: previous.block
      })

      for (const { token, currency } of previous.priceFeeds) {
        await this.oracleTokenCurrencyMapper.put({
          id: `${token}-${currency}-${previous.oracleId}`,
          key: `${token}-${currency}`,
          token: token,
          currency: currency,
          oracleId: previous.oracleId,
          weightage: previous.weightage,
          block: previous.block
        })
      }
    }
  }

  /**
   * Get previous oracle before current height
   */
  private async getPrevious (oracleId: string): Promise<OracleHistory> {
    const histories = await this.oracleHistoryMapper.query(oracleId, 1)
    if (histories.length === 0) {
      throw new NotFoundIndexerError('index', 'OracleHistory', oracleId)
    }

    return histories[0]
  }
}
