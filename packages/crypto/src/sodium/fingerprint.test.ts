import { fingerprint } from './fingerprint'
import { ready, sodium } from './sodium'

beforeAll(() => ready)

describe('fingerprint', () => {
  test('test vectors', () => {
    expect(fingerprint(sodium, '')).toEqual(
      'DldRwCblQ7Loqy6wYJnaodHl30d3j3eH-qtFzfEv46g'
    )
    expect(fingerprint(sodium, sodium.from_hex('00'))).toEqual(
      'AxcKLnWXt7fj2EwFOR0TmmKxV-eHhtjAgvKdz0wRExQ'
    )
    expect(fingerprint(sodium, sodium.from_hex('0001'))).toEqual(
      'Ac952klFw3DGiyZe9wZBqqZeqo9ZU-OQDZdyTCxaoJU'
    )
    expect(fingerprint(sodium, sodium.from_hex('00010203'))).toEqual(
      '4erlqK2uZS7Jr5Z3NGqdYOztYeOgppv6z1GNsx-G42s'
    )
    expect(
      fingerprint(
        sodium,
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur ornare vel justo sed rhoncus. Nulla tempus congue volutpat. Nullam faucibus elit in odio bibendum aliquet. In vitae sodales nisl. Integer eget feugiat lectus. Pellentesque iaculis eros est. Donec est lorem, laoreet ut erat non, fringilla ullamcorper velit. Nam tincidunt, orci vitae condimentum malesuada, felis velit laoreet libero, nec egestas odio est non mi. Ut in risus odio. Phasellus ut purus dapibus, fermentum magna in, feugiat neque. Ut eu dolor eget sapien congue cursus.'
      )
    ).toEqual('dgr9M_Z_TqQJ6JcjB90BL-qiiFldwJ4SdbTIFGTcOQU')
  })
  test('diffusion', () => {
    expect(fingerprint(sodium, new Uint8Array([0]))).toEqual(
      'AxcKLnWXt7fj2EwFOR0TmmKxV-eHhtjAgvKdz0wRExQ'
    )
    expect(fingerprint(sodium, new Uint8Array([1]))).toEqual(
      '7hVazpxAKSB0y2r_jJzN0nPIFkj_EUnvNrzqbruKPiU'
    )
  })
})
