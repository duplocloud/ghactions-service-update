import axios, {AxiosRequestConfig} from 'axios'
import {Observable} from 'rxjs'

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
      'Content-type': 'application/json; charset=UTF-8'
    }
  }

  get<T>(path: string, options?: HttpOptions): Observable<T> {
    return this.doRequest(path, 'GET', null, options)
  }

  post<T>(path: string, body: string | null | object, options?: HttpOptions): Observable<T> {
    return this.doRequest(path, 'POST', body, options)
  }

  put<T>(path: string, body: string | null | object, options?: HttpOptions): Observable<T> {
    return this.doRequest(path, 'PUT', body, options)
  }

  delete<T>(path: string, options?: HttpOptions): Observable<T> {
    return this.doRequest(path, 'DELETE', null, options)
  }

  private doRequest<T>(
    path: string,
    method: string,
    body?: string | null | object,
    options?: HttpOptions
  ): Observable<T> {
    const input = `${this.host}${path}`
    const config: AxiosRequestConfig = {
      method,
      url: input,
      headers: {...this.headers, ...options?.headers},
      data: body
    }

    return new Observable(observer => {
      axios(config)
        .then(response => {
          observer.next(response.data)
          observer.complete()
        })
        .catch(error => {
          observer.error(error)
        })
    })
  }
}
