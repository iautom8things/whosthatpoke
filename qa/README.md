# QA presets

`playwright-cli` configs for the devices this game must work on. WebKit stands in for iPad and iPhone Safari.

```sh
playwright-cli -s=<session> open --config=qa/playwright/ipad-landscape.json "http://localhost:<port>/?demo=<name>"
```

| preset | engine | viewport | touch |
| --- | --- | --- | --- |
| phone-portrait | webkit | 390x844 @3x | yes |
| phone-landscape | webkit | 844x390 @3x | yes |
| ipad-portrait | webkit | 820x1180 @2x | yes |
| ipad-landscape | webkit | 1180x820 @2x | yes |
| ipad-pro-landscape | webkit | 1366x1024 @2x | yes |
| projector-720 | chromium | 1280x720 | no |
| projector-480 | chromium | 854x480 | no |
| desktop-1080 | chromium | 1920x1080 | no |
