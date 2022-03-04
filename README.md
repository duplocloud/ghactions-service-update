<p align="center">
  <a href="https://github.com/duplocloud/ghactions-service-update/actions"><img alt="ghactions-service-update status" src="https://github.com/duplocloud/ghactions-service-update/workflows/build-test/badge.svg"></a>
</p>

# Update one or more Services running in Duplo

This action will update one or more services running in Duplo.

# Usage

Here is an example of what to put in your `.github/workflows/build-and-deploy.yml` file to use this workflow.

## Example updating a Duplo service

```yaml
name: Build and Deploy
on:
  push:
    branches:
      - develop # branch to trigger on
jobs:
  deploy:
    # This example updates a service named "nginx" to use an image "nginx:latest"
    name: Deploy with DuploCloud
    runs-on: ubuntu-latest
    steps:
      - name: service-update
        uses: duplocloud/ghactions-service-update@master
        with:
          duplo_host: https://mysystem.duplocloud.net
          duplo_token: ${{ secrets.DUPLO_TOKEN }}
          tenant: default
          services: |-
            [
              { "Name": "nginx", "Image": "nginx:latest" }
            ]
```

## Example updating an ECS service

```yaml
name: Build and Deploy
on:
  push:
    branches:
      - develop # branch to trigger on
jobs:
  deploy:
    # This example updates a service named "nginx" to use an image "nginx:latest"
    name: Deploy with DuploCloud
    runs-on: ubuntu-latest
    steps:
      - name: service-update
        uses: duplocloud/ghactions-service-update@master
        with:
          duplo_host: https://mysystem.duplocloud.net
          duplo_token: ${{ secrets.DUPLO_TOKEN }}
          tenant: default
          ecs_services: |-
            [
              { "Name": "nginx", "Image": "nginx:latest" }
            ]
```

## Inputs

| Name | Description | Required | Default |
|------|-------------|----------|---------|
| tenant | Tenant name or ID | true | unset |
| services | JSON for the services to be updated (see below for JSON format) | false | `[]` |
| ecs_services | JSON for the ECS services to be updated (see below for JSON format) | false | `[]` |
| duplo_host | Base URL of the Duplo installation (no trailing slash) - defaults to `duplo_host` env var | true (if no env var) | unset |
| duplo_token | API token - defaults to `duplo_token` env var | true (if no env var) | unset |

### services - JSON format

| Key | Description | Required | Default |
|------|-------------|----------|---------|
| Name | Name of the Duplo service | true | unset |
| Image | Docker image to deploy | true | unset |
| AgentPlatform | Agent platform identifier | false | (retain existing value in Duplo) |
| Env | Overwrites all environment variables (see below for JSON format) | false | (retain existing value in Duplo) |
| MergeEnv | Overwrites all environment variables (see below for JSON format) | false | unset |
| DeleteEnv | Deletes environment variables (see below for JSON format) | false | unset |

#### services.Env / services.MergeEnv

This format matches what you would enter in the *Environment variables* field in the DuploCloud UI (but in JSON format).

#### services.Env / services.MergeEnv - Non-kubernetes service types

For non-Kubernetes services, the format of the `Env` or `MergeEnv` fields is a simple JSON object, where keys are the env var names, and values are the env var values.

Example:

```json
{
  "MY_ENV_VAR" : "my value",
  "OTHER_ENV_VAR" : "other value"
}
```

#### services.Env / services.MergeEnv - Kubernetes services

For Kubernetes services, the format of the `Env` or `MergeEnv` fields matches the Kubernetes format for environment variables (but in JSON format).

Example:

```json
[
  {
    "Name": "MY_ENV_VAR",
    "Value": "my value"
  },
  {
    "Name": "MY_ENV_VAR_FROM_A_CONFIG_MAP",
    "ValueFrom": {
      "ConfigMapKeyRef": {
        "Name": "my-kubernetes-configmap",
        "Key": "my-key-in-the-configmap",
      }
    }
  },
  {
    "Name": "MY_ENV_VAR_FROM_A_SECRET",
    "ValueFrom": {
      "SecretKeyRef": {
        "Name": "my-kubernetes-secret",
        "Key": "my-key-in-the-secret",
      }
    }
  }
]
```

#### services.DeleteEnv

This field is a simple JSON array of strings, listing the environment variables to be deleted: `["MY_ENV_VAR", "OTHER_ENV_VAR"]`

### ecs_services - JSON format

| Key | Description | Required | Default |
|------|-------------|----------|---------|
| Name | Name of the ECS service | true | unset |
| Image | Docker image to deploy | true | unset |

## Outputs

None.
