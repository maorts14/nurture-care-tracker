param(
  [Parameter(Mandatory = $true)]
  [string]$Version
)

$registry = "ghcr.io/maorts14"
$images = @(
  @{ Name = "feedme-api"; Dockerfile = "server/Dockerfile" },
  @{ Name = "feedme-web"; Dockerfile = "web.Dockerfile" },
  @{ Name = "feedme-db"; Dockerfile = "server/db.Dockerfile" }
)

foreach ($image in $images) {
  $versionTag = "$registry/$($image.Name):$Version"
  $latestTag = "$registry/$($image.Name):latest"

  docker build --file $image.Dockerfile --tag $versionTag --tag $latestTag .
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  docker push $versionTag
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  docker push $latestTag
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
