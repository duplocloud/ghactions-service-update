<p align="center">
  <a href="https://github.com/duplocloud/ghactions-service-update/actions"><img alt="ghactions-service-update status" src="https://github.com/duplocloud/ghactions-service-update/workflows/build-test/badge.svg"></a>
</p>

# Update one or more Services running in Duplo

This action will update one or more services running in Duplo.

# Usage

Here is an example of what to put in your `.github/workflows/build-and-deploy.yml` file to use this workflow.

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

# License

The scripts and documentation in this project are released under the [MIT License](LICENSE)
