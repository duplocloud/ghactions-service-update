import {Observable, of, throwError} from 'rxjs'
import {switchMap} from 'rxjs/operators'
import Axios from 'axios-observable'

export type HttpHeaders = {[header: string]: string}

export interface HttpOptions {
  headers?: HttpHeaders
}

export class DuploHttpClient {
  private headers: {[name: string]: string}

  constructor(private host?: string, private token?: string) {
    if (!this.host?.length) this.host = process.env.duplo_host
    if (!this.host?.length) throw new Error('duplo_host: env var missing or empty')

    if (!this.token?.length) this.token = process.env.duplo_token
    if (!this.token?.length) throw new Error('duplo_token: env var missing or empty')

    this.headers = {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8'
    }
  }

  get<T>(path: string, options?: HttpOptions): Observable<T> {
    return this.doFetch(path, 'GET', null, options)
  }

  post<T>(path: string, body: string | null | object, options?: HttpOptions): Observable<T> {
    return this.doFetch(path, 'POST', body, options)
  }

  put<T>(path: string, body: string | null | object, options?: HttpOptions): Observable<T> {
    return this.doFetch(path, 'PUT', body, options)
  }

  delete<T>(path: string, options?: HttpOptions): Observable<T> {
    return this.doFetch(path, 'DELETE', null, options)
  }

  private doFetch<T>(
    path: string,
    method: string,
    body?: string | null | object,
    options?: HttpOptions
  ): Observable<T> {
    let data
    if (typeof body === 'string') data = body
    else if (body) data = JSON.stringify(body)

    const init = Object.assign(
      {
        method,
        baseURL: this.host,
        url: path,
        data,
        headers: this.headers
      },
      options ?? {}
    )

    return Axios.request(init).pipe(
      switchMap(response => {
        if (response.statusText === 'OK' && response.status === 200) {
          const l = response.headers['content-length']?.toString()
          if (!l || l !== '0') {
            return of(response.data) as unknown as Observable<T>
          }
          return of(null) as unknown as Observable<T>
        }
        return throwError(response)
      })
    )
  }
}
