import {ReplicationController, ServicePatchRequest, UserTenant} from './model'
import {DuploHttpClient} from './httpclient'
import {Observable} from 'rxjs'
import {map} from 'rxjs/operators'

export class DataSource {
  constructor(private api: DuploHttpClient) {}

  getTenantsForUser(): Observable<UserTenant[]> {
    return this.api
      .get<UserTenant[]>('/admin/GetTenantsForUser')
      .pipe(map(list => list.map(item => new UserTenant(item))))
  }

  getTenant(idOrName: string): Observable<UserTenant | undefined> {
    if (idOrName.length >= 32) return this.getTenantById(idOrName)
    return this.getTenantByName(idOrName)
  }

  getTenantById(id: string): Observable<UserTenant | undefined> {
    return this.getTenantsForUser().pipe(map(list => list.find(tenant => tenant.TenantId === id)))
  }

  getTenantByName(name: string): Observable<UserTenant | undefined> {
    return this.getTenantsForUser().pipe(map(list => list.find(tenant => tenant.AccountName === name)))
  }

  getReplicationControllers(tenantId: string): Observable<ReplicationController[]> {
    return this.api.get<ReplicationController[]>(`/subscriptions/${tenantId}/GetReplicationControllers`).pipe(
      map(list => {
        return list.map(item => new ReplicationController(item))
      })
    )
  }

  getReplicationController(tenantId: string, name: string): Observable<ReplicationController | undefined> {
    return this.getReplicationControllers(tenantId).pipe(
      map(list => {
        return list.find(l => l.Name === name)
      })
    )
  }

  patchService(tenantId: string, request: ServicePatchRequest): Observable<null> {
    return this.api.post<null>(`/subscriptions/${tenantId}/ReplicationControllerChange`, request)
  }
}
