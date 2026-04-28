# Local Steam App Signal Samples

- Generated: 2026-04-27T19:55:27Z
- Steam root: C:/Program Files (x86)/Steam
- Source report: local-steam-coverage-local-steam-spitemonger.json
- Sample appids: 20

## Notes

- Paths are anonymized to avoid including local account IDs.
- cloudCollections comes from cloud-storage-namespace-1.json entries.
- configSignals comes from localconfig.vdf / sharedconfig.vdf quoted appid references with nearby snippets.
- Config parsing here is intentionally heuristic for discovery, not a canonical parser.

## Sample Blocks

### AppID 220

- Cloud collections: ["Ze Done"]
- Config match counts: [{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf","matchCount":0},{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf","matchCount":0}]

```json
{
  "appid": 220,
  "cloudCollections": [
    "Ze Done"
  ],
  "configSignals": [
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf",
      "matchCount": 0,
      "snippet": ""
    },
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf",
      "matchCount": 0,
      "snippet": ""
    }
  ]
}
```

### AppID 240

- Cloud collections: ["Ze Done"]
- Config match counts: [{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf","matchCount":0},{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf","matchCount":1}]

```json
{
  "appid": 240,
  "cloudCollections": [
    "Ze Done"
  ],
  "configSignals": [
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf",
      "matchCount": 0,
      "snippet": ""
    },
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf",
      "matchCount": 1,
      "snippet": "\t\t\t\t\t}\n\t\t\t\t\t\"1463920\"\n\t\t\t\t\t{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"1739076551\"\n\t\t\t\t\t\t\"Playtime\"\t\t\"240\"\n\t\t\t\t\t\t\"cloud\"\n\t\t\t\t\t\t{\n\t\t\t\t\t\t\t\"last_sync_state\"\t\t\"synchronized\"\n\t\t\t\t\t\t}\n\t\t\t\t\t\t\"autocloud\"\n\t\t\t\t\t\t{\n\t\t\t\t\t\t\t\"lastlaunch\"\t\t\"1736484893\"\n\t\t\t\t\t\t\t\"lastexit\"\t\t\"1736486863\""
    }
  ]
}
```

### AppID 320

- Cloud collections: ["Ze Done"]
- Config match counts: [{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf","matchCount":0},{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf","matchCount":1}]

```json
{
  "appid": 320,
  "cloudCollections": [
    "Ze Done"
  ],
  "configSignals": [
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf",
      "matchCount": 0,
      "snippet": ""
    },
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf",
      "matchCount": 1,
      "snippet": "\t\t\"243970\"\n\t\t{\n\t\t\t\"UseSteamControllerConfig\"\t\t\"2\"\n\t\t\t\"SteamControllerRumble\"\t\t\"-1\"\n\t\t\t\"SteamControllerRumbleIntensity\"\t\t\"320\"\n\t\t}\n\t}\n\t\"controller_config\"\n\t{\n\t\t\"2238040\"\n\t\t{\n\t\t\t\"usetime\"\t\t\"3546.208984375\"\n\t\t}"
    }
  ]
}
```

### AppID 360

- Cloud collections: ["Ze Done"]
- Config match counts: [{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf","matchCount":0},{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf","matchCount":0}]

```json
{
  "appid": 360,
  "cloudCollections": [
    "Ze Done"
  ],
  "configSignals": [
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf",
      "matchCount": 0,
      "snippet": ""
    },
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf",
      "matchCount": 0,
      "snippet": ""
    }
  ]
}
```

### AppID 400

- Cloud collections: ["Ze Done"]
- Config match counts: [{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf","matchCount":0},{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf","matchCount":2}]

```json
{
  "appid": 400,
  "cloudCollections": [
    "Ze Done"
  ],
  "configSignals": [
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf",
      "matchCount": 0,
      "snippet": ""
    },
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf",
      "matchCount": 2,
      "snippet": "\t\t\t\t\t{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"1358150400\"\n\t\t\t\t\t\t\"Playtime\"\t\t\"13\"\n\t\t\t\t\t}\n\t\t\t\t\t\"400\"\n\t\t\t\t\t{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"86400\"\n\t\t\t\t\t\t\"Playtime\"\t\t\"134\"\n\t\t\t\t\t}\n\t\t\t\t\t\"440\"\n\t\t\t\t\t{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"1415156113\"\n\t\t\t\t\t\t\"Playtime\"\t\t\"5247\""
    }
  ]
}
```

### AppID 440

- Cloud collections: ["Ze Done"]
- Config match counts: [{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf","matchCount":0},{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf","matchCount":1}]

```json
{
  "appid": 440,
  "cloudCollections": [
    "Ze Done"
  ],
  "configSignals": [
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf",
      "matchCount": 0,
      "snippet": ""
    },
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf",
      "matchCount": 1,
      "snippet": "\t\t\t\t\t{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"86400\"\n\t\t\t\t\t\t\"Playtime\"\t\t\"134\"\n\t\t\t\t\t}\n\t\t\t\t\t\"440\"\n\t\t\t\t\t{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"1415156113\"\n\t\t\t\t\t\t\"Playtime\"\t\t\"5247\"\n\t\t\t\t\t}\n\t\t\t\t\t\"480\"\n\t\t\t\t\t{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"1482018609\"\n\t\t\t\t\t\t\"Playtime\"\t\t\"1\""
    }
  ]
}
```

### AppID 550

- Cloud collections: ["Ze Done"]
- Config match counts: [{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf","matchCount":0},{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf","matchCount":1}]

```json
{
  "appid": 550,
  "cloudCollections": [
    "Ze Done"
  ],
  "configSignals": [
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf",
      "matchCount": 0,
      "snippet": ""
    },
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf",
      "matchCount": 1,
      "snippet": "\t\t\t\t\t{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"1482018609\"\n\t\t\t\t\t\t\"Playtime\"\t\t\"1\"\n\t\t\t\t\t}\n\t\t\t\t\t\"550\"\n\t\t\t\t\t{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"1421532951\"\n\t\t\t\t\t\t\"Playtime\"\t\t\"685\"\n\t\t\t\t\t}\n\t\t\t\t\t\"620\"\n\t\t\t\t\t{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"1319353200\"\n\t\t\t\t\t\t\"Playtime\"\t\t\"882\""
    }
  ]
}
```

### AppID 620

- Cloud collections: ["Multiplayer"]
- Config match counts: [{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf","matchCount":0},{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf","matchCount":1}]

```json
{
  "appid": 620,
  "cloudCollections": [
    "Multiplayer"
  ],
  "configSignals": [
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf",
      "matchCount": 0,
      "snippet": ""
    },
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf",
      "matchCount": 1,
      "snippet": "\t\t\t\t\t{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"1421532951\"\n\t\t\t\t\t\t\"Playtime\"\t\t\"685\"\n\t\t\t\t\t}\n\t\t\t\t\t\"620\"\n\t\t\t\t\t{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"1319353200\"\n\t\t\t\t\t\t\"Playtime\"\t\t\"882\"\n\t\t\t\t\t}\n\t\t\t\t\t\"630\"\n\t\t\t\t\t{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"1459304244\"\n\t\t\t\t\t\t\"Playtime\"\t\t\"27\""
    }
  ]
}
```

### AppID 1250

- Cloud collections: ["Ze Done"]
- Config match counts: [{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf","matchCount":0},{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf","matchCount":0}]

```json
{
  "appid": 1250,
  "cloudCollections": [
    "Ze Done"
  ],
  "configSignals": [
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf",
      "matchCount": 0,
      "snippet": ""
    },
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf",
      "matchCount": 0,
      "snippet": ""
    }
  ]
}
```

### AppID 1500

- Cloud collections: ["Ze Done"]
- Config match counts: [{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf","matchCount":0},{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf","matchCount":0}]

```json
{
  "appid": 1500,
  "cloudCollections": [
    "Ze Done"
  ],
  "configSignals": [
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf",
      "matchCount": 0,
      "snippet": ""
    },
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf",
      "matchCount": 0,
      "snippet": ""
    }
  ]
}
```

### AppID 1510

- Cloud collections: ["Ze Done"]
- Config match counts: [{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf","matchCount":0},{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf","matchCount":1}]

```json
{
  "appid": 1510,
  "cloudCollections": [
    "Ze Done"
  ],
  "configSignals": [
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf",
      "matchCount": 0,
      "snippet": ""
    },
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf",
      "matchCount": 1,
      "snippet": "\t\t\t\t\t{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"1459304244\"\n\t\t\t\t\t\t\"Playtime\"\t\t\"27\"\n\t\t\t\t\t}\n\t\t\t\t\t\"1510\"\n\t\t\t\t\t{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"86400\"\n\t\t\t\t\t\t\"Playtime\"\t\t\"34\"\n\t\t\t\t\t}\n\t\t\t\t\t\"1520\"\n\t\t\t\t\t{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"1324627200\"\n\t\t\t\t\t\t\"Playtime\"\t\t\"25\""
    }
  ]
}
```

### AppID 1520

- Cloud collections: ["Ze Done"]
- Config match counts: [{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf","matchCount":0},{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf","matchCount":1}]

```json
{
  "appid": 1520,
  "cloudCollections": [
    "Ze Done"
  ],
  "configSignals": [
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf",
      "matchCount": 0,
      "snippet": ""
    },
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf",
      "matchCount": 1,
      "snippet": "\t\t\t\t\t{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"86400\"\n\t\t\t\t\t\t\"Playtime\"\t\t\"34\"\n\t\t\t\t\t}\n\t\t\t\t\t\"1520\"\n\t\t\t\t\t{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"1324627200\"\n\t\t\t\t\t\t\"Playtime\"\t\t\"25\"\n\t\t\t\t\t}\n\t\t\t\t\t\"3720\"\n\t\t\t\t\t{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"1561918549\"\n\t\t\t\t\t\t\"Playtime\"\t\t\"41\""
    }
  ]
}
```

### AppID 1523

- Cloud collections: ["Hidden"]
- Config match counts: [{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf","matchCount":0},{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf","matchCount":0}]

```json
{
  "appid": 1523,
  "cloudCollections": [
    "Hidden"
  ],
  "configSignals": [
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf",
      "matchCount": 0,
      "snippet": ""
    },
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf",
      "matchCount": 0,
      "snippet": ""
    }
  ]
}
```

### AppID 1700

- Cloud collections: ["To Play"]
- Config match counts: [{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf","matchCount":0},{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf","matchCount":0}]

```json
{
  "appid": 1700,
  "cloudCollections": [
    "To Play"
  ],
  "configSignals": [
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf",
      "matchCount": 0,
      "snippet": ""
    },
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf",
      "matchCount": 0,
      "snippet": ""
    }
  ]
}
```

### AppID 2600

- Cloud collections: ["Ze Done"]
- Config match counts: [{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf","matchCount":0},{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf","matchCount":0}]

```json
{
  "appid": 2600,
  "cloudCollections": [
    "Ze Done"
  ],
  "configSignals": [
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf",
      "matchCount": 0,
      "snippet": ""
    },
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf",
      "matchCount": 0,
      "snippet": ""
    }
  ]
}
```

### AppID 3720

- Cloud collections: ["Ze Done"]
- Config match counts: [{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf","matchCount":0},{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf","matchCount":1}]

```json
{
  "appid": 3720,
  "cloudCollections": [
    "Ze Done"
  ],
  "configSignals": [
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf",
      "matchCount": 0,
      "snippet": ""
    },
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf",
      "matchCount": 1,
      "snippet": "\t\t\t\t\t{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"1324627200\"\n\t\t\t\t\t\t\"Playtime\"\t\t\"25\"\n\t\t\t\t\t}\n\t\t\t\t\t\"3720\"\n\t\t\t\t\t{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"1561918549\"\n\t\t\t\t\t\t\"Playtime\"\t\t\"41\"\n\t\t\t\t\t}\n\t\t\t\t\t\"3830\"\n\t\t\t\t\t{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"1324454400\"\n\t\t\t\t\t\t\"Playtime\"\t\t\"132\""
    }
  ]
}
```

### AppID 3830

- Cloud collections: ["Ze Done"]
- Config match counts: [{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf","matchCount":0},{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf","matchCount":1}]

```json
{
  "appid": 3830,
  "cloudCollections": [
    "Ze Done"
  ],
  "configSignals": [
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf",
      "matchCount": 0,
      "snippet": ""
    },
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf",
      "matchCount": 1,
      "snippet": "\t\t\t\t\t{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"1561918549\"\n\t\t\t\t\t\t\"Playtime\"\t\t\"41\"\n\t\t\t\t\t}\n\t\t\t\t\t\"3830\"\n\t\t\t\t\t{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"1324454400\"\n\t\t\t\t\t\t\"Playtime\"\t\t\"132\"\n\t\t\t\t\t}\n\t\t\t\t\t\"4000\"\n\t\t\t\t\t{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"1335164400\"\n\t\t\t\t\t\t\"Playtime\"\t\t\"1783\""
    }
  ]
}
```

### AppID 3970

- Cloud collections: ["Ze Done"]
- Config match counts: [{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf","matchCount":0},{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf","matchCount":0}]

```json
{
  "appid": 3970,
  "cloudCollections": [
    "Ze Done"
  ],
  "configSignals": [
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf",
      "matchCount": 0,
      "snippet": ""
    },
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf",
      "matchCount": 0,
      "snippet": ""
    }
  ]
}
```

### AppID 4000

- Cloud collections: ["Multiplayer"]
- Config match counts: [{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf","matchCount":0},{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf","matchCount":1}]

```json
{
  "appid": 4000,
  "cloudCollections": [
    "Multiplayer"
  ],
  "configSignals": [
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf",
      "matchCount": 0,
      "snippet": ""
    },
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf",
      "matchCount": 1,
      "snippet": "\t\t\t\t\t{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"1324454400\"\n\t\t\t\t\t\t\"Playtime\"\t\t\"132\"\n\t\t\t\t\t}\n\t\t\t\t\t\"4000\"\n\t\t\t\t\t{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"1335164400\"\n\t\t\t\t\t\t\"Playtime\"\t\t\"1783\"\n\t\t\t\t\t}\n\t\t\t\t\t\"4330\"\n\t\t\t\t\t{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"86400\"\n\t\t\t\t\t\t\"Playtime\"\t\t\"5\""
    }
  ]
}
```

### AppID 4560

- Cloud collections: ["Meh"]
- Config match counts: [{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf","matchCount":0},{"path":"C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf","matchCount":0}]

```json
{
  "appid": 4560,
  "cloudCollections": [
    "Meh"
  ],
  "configSignals": [
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/7/remote/sharedconfig.vdf",
      "matchCount": 0,
      "snippet": ""
    },
    {
      "path": "C:/Program Files (x86)/Steam/userdata/<redacted>/config/localconfig.vdf",
      "matchCount": 0,
      "snippet": ""
    }
  ]
}
```

