import { MasterNodeRegTestContainer } from '@defichain/testcontainers'
import { NestFastifyApplication } from '@nestjs/platform-fastify'
import { createTestingApp, stopTestingApp, waitForIndexedHeight } from '@src/e2e.module'
import { OracleController } from '@src/module.api/oracle.controller'
import { OracleState } from '@whale-api-client/api/oracle'

const container = new MasterNodeRegTestContainer()
let app: NestFastifyApplication
let controller: OracleController

describe('1 - Oracle Weightage', () => {
  let oracleId: string
  let height: number

  beforeAll(async () => {
    await container.start()
    await container.waitForReady()
    await container.waitForWalletCoinbaseMaturity()

    app = await createTestingApp(container)
    controller = app.get(OracleController)

    const priceFeeds = [{ token: 'APPL', currency: 'EUR' }]
    oracleId = await container.call('appointoracle', [await container.getNewAddress(), priceFeeds, 1])

    await container.generate(1)

    await container.call('updateoracle', [oracleId, await container.getNewAddress(), priceFeeds, 2])

    await container.generate(1)

    height = await container.call('getblockcount')
  })

  afterAll(async () => {
    await stopTestingApp(container, app)
  })

  it('should get status 5 blocks after the oracle was updated', async () => {
    await waitForIndexedHeight(app, height + 5)

    const result = await controller.getStatus(oracleId)
    expect(result?.data.weightage).toStrictEqual(2)
  })

  it('should return undefined if get status with invalid oracle id', async () => {
    await waitForIndexedHeight(app, height)

    const result = await controller.getStatus('invalid')
    expect(result).toStrictEqual(undefined)
  })
})

describe('2 - Oracle Price Feed', () => {
  let oracleId1: string
  let oracleId2: string
  let height: number

  beforeAll(async () => {
    await container.start()
    await container.waitForReady()
    await container.waitForWalletCoinbaseMaturity()

    app = await createTestingApp(container)
    controller = app.get(OracleController)

    const priceFeeds1 = [
      { token: 'APPL', currency: 'EUR' }
    ]

    oracleId1 = await container.call('appointoracle', [await container.getNewAddress(), priceFeeds1, 1])

    await container.generate(1)

    const priceFeeds2 = [
      { token: 'TESL', currency: 'USD' }
    ]

    await container.call('updateoracle', [oracleId1, await container.getNewAddress(), priceFeeds2, 2])

    await container.generate(1)

    await container.call('getblockcount')

    const priceFeeds3 = [
      { token: 'FB', currency: 'CNY' }
    ]

    oracleId2 = await container.call('appointoracle', [await container.getNewAddress(), priceFeeds3, 1])

    await container.generate(1)

    const priceFeeds4 = [
      { token: 'MSFT', currency: 'SGD' }
    ]

    await container.call('updateoracle', [oracleId2, await container.getNewAddress(), priceFeeds4, 2])

    await container.generate(1)

    height = await container.call('getblockcount')
  })

  afterAll(async () => {
    await stopTestingApp(container, app)
  })

  it('should get all price feeds 5 blocks after the last oracle was updated', async () => {
    await waitForIndexedHeight(app, height + 5)

    const result = await controller.getPriceFeeds() ?? []

    // Result sorted by token, currency and block height
    expect(result[0]?.data.token).toStrictEqual('APPL')
    expect(result[0]?.data.currency).toStrictEqual('EUR')
    expect(result[0]?.state).toStrictEqual(OracleState.REMOVED)

    expect(result[1]?.data.token).toStrictEqual('FB')
    expect(result[1]?.data.currency).toStrictEqual('CNY')
    expect(result[1]?.state).toStrictEqual(OracleState.REMOVED)

    expect(result[2]?.data.token).toStrictEqual('MSFT')
    expect(result[2]?.data.currency).toStrictEqual('SGD')
    expect(result[2]?.state).toStrictEqual(OracleState.LIVE)

    expect(result[3]?.data.token).toStrictEqual('TESL')
    expect(result[3]?.data.currency).toStrictEqual('USD')
    expect(result[3]?.state).toStrictEqual(OracleState.LIVE)
  })

  it('should get all price feeds with oracle id 5 blocks after the last oracle was updated', async () => {
    await waitForIndexedHeight(app, height + 5)

    const result1 = await controller.getPriceFeed(oracleId1) ?? []

    expect(result1[0]?.data.token).toStrictEqual('APPL')
    expect(result1[0]?.data.currency).toStrictEqual('EUR')
    expect(result1[0]?.state).toStrictEqual(OracleState.REMOVED)

    expect(result1[1]?.data.token).toStrictEqual('TESL')
    expect(result1[1]?.data.currency).toStrictEqual('USD')
    expect(result1[1]?.state).toStrictEqual(OracleState.LIVE)

    const result2 = await controller.getPriceFeed(oracleId2) ?? []

    expect(result2[0]?.data.token).toStrictEqual('FB')
    expect(result2[0]?.data.currency).toStrictEqual('CNY')
    expect(result2[0]?.state).toStrictEqual(OracleState.REMOVED)

    expect(result2[1]?.data.token).toStrictEqual('MSFT')
    expect(result2[1]?.data.currency).toStrictEqual('SGD')
    expect(result2[1]?.state).toStrictEqual(OracleState.LIVE)
  })

  it('should return empty array if get price feeds with invalid oracle id', async () => {
    await waitForIndexedHeight(app, height)

    const result = await controller.getPriceFeed('invalid')

    expect(result).toStrictEqual([])
  })
})

describe('3 - Oracle Price Data', () => {
  let oracleId: string
  let height: number

  beforeAll(async () => {
    await container.start()
    await container.waitForReady()
    await container.waitForWalletCoinbaseMaturity()

    app = await createTestingApp(container)
    controller = app.get(OracleController)

    const priceFeeds1 = [
      { token: 'APPL', currency: 'EUR' },
      { token: 'TESL', currency: 'USD' }
    ]
    oracleId = await container.call('appointoracle', [await container.getNewAddress(), priceFeeds1, 1])

    await container.generate(1)

    const timestamp = Math.floor(new Date().getTime() / 1000)

    const prices = [
      { tokenAmount: '0.5@APPL', currency: 'EUR' },
      { tokenAmount: '1.0@TESL', currency: 'USD' }
    ]

    await container.call('setoracledata', [oracleId, timestamp, prices])

    await container.generate(1)

    height = await container.call('getblockcount')
  })

  afterAll(async () => {
    await stopTestingApp(container, app)
  })

  it('should get all price data with oracle id 5 blocks after the oracle was updated', async () => {
    await waitForIndexedHeight(app, height + 5)

    const result = await controller.getPriceData(oracleId) ?? []
    expect(result.length).toStrictEqual(2)

    expect(result[0]?.data.token).toStrictEqual('APPL')
    expect(result[0]?.data.currency).toStrictEqual('EUR')
    expect(result[0]?.data.amount).toStrictEqual('0.5')
    expect(result[0]?.state).toStrictEqual(OracleState.LIVE)

    expect(result[1]?.data.token).toStrictEqual('TESL')
    expect(result[1]?.data.currency).toStrictEqual('USD')
    expect(result[1]?.data.amount).toStrictEqual('1')
    expect(result[1]?.state).toStrictEqual(OracleState.LIVE)
  })

  it('should return empty array if get price data with invalid oracle id', async () => {
    await waitForIndexedHeight(app, height)

    const result = await controller.getPriceData('invalid')

    expect(result).toStrictEqual([])
  })
})

describe('4 - Oracle Price', () => {
  let timestamp1: number
  let timestamp2: number
  let height: number

  beforeAll(async () => {
    await container.start()
    await container.waitForReady()
    await container.waitForWalletCoinbaseMaturity()

    app = await createTestingApp(container)
    controller = app.get(OracleController)

    const priceFeeds = [
      { token: 'APPL', currency: 'EUR' }
    ]

    const oracleId1 = await container.call('appointoracle', [await container.getNewAddress(), priceFeeds, 1])

    await container.generate(1)

    const oracleId2 = await container.call('appointoracle', [await container.getNewAddress(), priceFeeds, 2])

    await container.generate(1)

    let stats = await container.call('getblockstats', [await container.call('getblockcount')])
    timestamp1 = Number(stats.time) + 1

    const prices1 = [
      { tokenAmount: '0.5@APPL', currency: 'EUR' }
    ]

    await container.call('setoracledata', [oracleId1, timestamp1, prices1])

    await container.generate(10)

    const prices2 = [
      { tokenAmount: '1.0@APPL', currency: 'EUR' }
    ]

    stats = await container.call('getblockstats', [await container.call('getblockcount')])
    timestamp2 = Number(stats.time) + 1

    await container.call('setoracledata', [oracleId2, timestamp2, prices2])

    await container.generate(1)

    height = await container.call('getblockcount')
  })

  afterAll(async () => {
    await stopTestingApp(container, app)
  })

  it('should get latest price for token and currency 5 blocks after the oracle was updated', async () => {
    await waitForIndexedHeight(app, height + 5)

    const result = await controller.getPrice('APPL', 'EUR')

    expect(result?.data.token).toStrictEqual('APPL')
    expect(result?.data.currency).toStrictEqual('EUR')
    expect(result?.data.amount).toStrictEqual(0.8333333333333334)
  })

  it('should return undefined if get latest price with invalid token and currency', async () => {
    await waitForIndexedHeight(app, height)

    const result = await controller.getPrice('invalid', 'invalid')

    expect(result).toStrictEqual(undefined)
  })

  it('should get price for token and currency at specific timestamp', async () => {
    await waitForIndexedHeight(app, height + 5)

    const result1 = await controller.getPriceByTimestamp('APPL', 'EUR', timestamp1)

    expect(result1?.data.token).toStrictEqual('APPL')
    expect(result1?.data.currency).toStrictEqual('EUR')
    expect(result1?.data.amount).toStrictEqual(0.5)

    const result2 = await controller.getPriceByTimestamp('APPL', 'EUR', timestamp2)

    expect(result2?.data.token).toStrictEqual('APPL')
    expect(result2?.data.currency).toStrictEqual('EUR')
    expect(result2?.data.amount).toStrictEqual(0.8333333333333334)
  })

  it('should return undefined if get latest price with invalid token, currency and timestamp', async () => {
    await waitForIndexedHeight(app, height + 5)

    const result = await controller.getPriceByTimestamp('invalid', 'invalid', -1)

    expect(result).toStrictEqual(undefined)
  })
})
