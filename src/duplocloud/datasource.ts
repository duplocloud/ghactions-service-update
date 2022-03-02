import {
  EcsServiceModel,
  EcsTaskDefinition,
  EcsTaskDefinitionArn,
  Pod,
  ReplicationController,
  ServicePatchRequest,
  UserTenant
} from './model'
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
    id = id.toLowerCase()
    return this.getTenantsForUser().pipe(map(list => list.find(tenant => tenant.TenantId.toLowerCase() === id)))
  }

  getTenantByName(name: string): Observable<UserTenant | undefined> {
    name = name.toLowerCase()
    return this.getTenantsForUser().pipe(map(list => list.find(tenant => tenant.AccountName.toLowerCase() === name)))
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

  getPods(tenantId: string): Observable<Pod[]> {
    return this.api.get<Pod[]>(`/subscriptions/${tenantId}/GetPods`).pipe(
      map(list => {
        return list.map(item => new Pod(item))
      })
    )
  }

  getPodsByService(tenantId: string, name: string): Observable<Pod[]> {
    return this.getPods(tenantId).pipe(map(pods => pods.filter(p => p.Name === name)))
  }

  getAllEcsServices(tenantId: string): Observable<EcsServiceModel[]> {
    return this.api.get<EcsServiceModel[]>(`/subscriptions/${tenantId}/GetEcsServices`).pipe(
      map(list => {
        return list.map(item => new EcsServiceModel(item))
      })
    )
  }

  getEcsService(tenantId: string, taskDefFamilyName: string): Observable<EcsServiceModel | undefined> {
    return this.getAllEcsServices(tenantId).pipe(
      map(list => list.find(item => item.TaskDefinition.includes(`${taskDefFamilyName}:`)))
    )
  }

  updateEcsService(tenantId: string, ecsService: EcsServiceModel): Observable<string> {
    return this.api.post<string>(`/subscriptions/${tenantId}/UpdateEcsService`, ecsService)
  }

  getAllEcsTaskDefArns(tenantId: string): Observable<EcsTaskDefinitionArn[]> {
    return this.api.get<EcsTaskDefinitionArn[]>(`/subscriptions/${tenantId}/GetEcsTaskDefinitionArns`).pipe(
      map(list => {
        return list.map(item => new EcsTaskDefinitionArn(`${item}`))
      })
    )
  }

  getEcsTaskDefArn(tenantId: string, taskDefFamilyName: string): Observable<EcsTaskDefinitionArn[]> {
    return this.getAllEcsTaskDefArns(tenantId).pipe(
      map(list => list.filter(item => item.TaskDefinitionArn.includes(`/${taskDefFamilyName}:`)))
    )
  }

  getTaskDefinitionDetails(tenantId: string, taskDefinitionArn: string): Observable<EcsTaskDefinition> {
    return this.api
      .post<EcsTaskDefinition>(`/subscriptions/${tenantId}/FindEcsTaskDefinition`, {Arn: taskDefinitionArn})
      .pipe(map(list => new EcsTaskDefinition(list)))
  }

  updateEcsTaskDefinition(tenantId: string, taskDef: EcsTaskDefinition): Observable<string> {
    return this.api.post<string>(`/subscriptions/${tenantId}/UpdateEcsTaskDefinition`, taskDef)
  }
}
