import {DuploHttpClient} from '../../src/duplocloud/httpclient'
import {expect} from '@jest/globals'

describe('DuploHttpClient integration', () => {
  // Integration tests.
  if (!process.env.duplo_token) {
    console.log('Skipping integration tests: duplo_token env var missing or empty')
    it('is skipped', () => {})
  } else {
    it('can get data from duplo', async () => {
      const client = new DuploHttpClient()

      const data$ = client.get('/admin/GetTenantsForUser')
      const result = await data$.toPromise()

      expect(result).not.toBeNull()
    })
  }
})
