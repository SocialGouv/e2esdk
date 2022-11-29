import { hashItems } from './hash'
import { ready, sodium } from './sodium'

beforeAll(() => ready)

describe('hash', () => {
  const h = (...input: string[]) =>
    sodium.to_hex(hashItems(sodium, ...input.map(i => sodium.from_hex(i))))

  test('BLAKE2b, default params', () => {
    expect(h('')).toEqual(
      '786a02f742015903c6c6fd852552d272912f4740e15847618a86e217f71f5419d25e1031afee585313896444934eb04b903a685b1448b755d56f701afe9be2ce'
    )
    expect(h('00', '010203')).toEqual(
      '77ddf4b14425eb3d053c1e84e3469d92c4cd910ed20f92035e0c99d8a7a86cecaf69f9663c20a7aa230bc82f60d22fb4a00b09d3eb8fc65ef547fe63c8d3ddce'
    )
    expect(h('0001', '0203')).toEqual(
      '77ddf4b14425eb3d053c1e84e3469d92c4cd910ed20f92035e0c99d8a7a86cecaf69f9663c20a7aa230bc82f60d22fb4a00b09d3eb8fc65ef547fe63c8d3ddce'
    )
  })
})
