import '../polyfill/fetch'

import {Observable, of, throwError} from 'rxjs'
import {fromFetch} from 'rxjs/fetch'
import {switchMap} from 'rxjs/operators'

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
    const input = `${this.host}${path}`
    const init: RequestInit = Object.assign({method, headers: this.headers}, options ?? {})
    if (typeof body === 'string') init.body = body
    else if (body) init.body = JSON.stringify(body)

    return fromFetch(input, init).pipe(
      switchMap(response => {
        if (response.ok) {
          const l = response.headers?.get('Content-Length')?.toString()
          if (!l || l !== '0') return response.json()
          return of(null) as unknown as Observable<T>
        }
        return throwError(response.body)
      })
    )
  }
}
