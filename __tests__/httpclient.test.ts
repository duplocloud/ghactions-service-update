import {DuploHttpClient} from '../src/duplocloud/httpclient'
import {expect, test} from '@jest/globals'

if (!process.env.duplo_token?.length) {
  console.log('Skipping httpclient tests: duplo_token env var missing or empty')
} else {
  test('DuploHttpClient: can get data from duplo', async () => {
    const client = new DuploHttpClient()

    const data$ = client.get('/admin/GetTenantsForUser')
    const result = await data$.toPromise()

    expect(result).not.toBeNull()
  })
}
