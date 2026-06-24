erDiagram
    DRIVER {
        bigint id PK
        string first_name
        string last_name
        string short_name
        date dob
        date dod
        string nationality
    }

    CONSTRUCTOR {
        bigint id PK
        string short_name
        string name
        string country
        int founded_year
        int defunct_year
        string notes
    }

    TEAM {
        bigint id PK
        string team_name
        string short_name
        string country
        int founded_year
        int defunct_year
    }

    CAR {
        bigint id PK
        bigint constructor_id FK
        string short_name
        string name
        string chassis_name
        string engine_name
        int introduced_year
        int retired_year
        string engine_manufacturer
        string notes
    }

    CIRCUIT {
        bigint id PK
        string short_name
        string name
        string city
        string country
        double lat
        double lon
        double alt
        string url
        int opened_year
        string notes
    }

    CIRCUIT_VERSION {
        bigint id PK
        bigint circuit_id FK
        string version_name
        date valid_from
        date valid_to
        int lap_length_m
        int turns
        string direction
        string layout_key
        string source
        string source_ref
    }

    COMPETITION {
        bigint id PK
        string name
        string era
        string scope
    }

    SEASON {
        bigint id PK
        int year
        bigint competition_id FK
        string rules
        string notes
    }

    EVENT {
        bigint id PK
        bigint season_id FK
        bigint regulatory_system_id FK
        int round
        date event_date
        bigint circuit_id FK
    }

    EVENT_ENTRY {
        bigint id PK
        bigint event_id FK
        bigint car_id FK
        bigint driver_id FK
        bigint team_id FK
        bigint tire_id FK
        int car_number
    }

    CHAMPIONSHIP {
        bigint id PK
        string short_name
        string championship_name
    }

    EVENT_CHAMPIONSHIP {
        bigint id PK
        bigint event_id FK
        bigint championship_id FK
    }

    SESSION {
        bigint id PK
        bigint event_id FK
        string type
        datetime date_time
    }

    SESSION_RESULT {
        bigint id PK
        bigint session_id FK
        bigint entry_id FK
        int position
        float points
        string time
        string gap
        string interval
        int laps
        string time_penalty
        int grid_position
        string retired_reason
    }

    DRIVER_STANDING {
        bigint id PK
        bigint event_id FK
        bigint driver_id FK
        int position
        float points
    }

    REGULATORY_SYSTEM {
        bigint id PK
        string abbreviation
        string name
    }

    TIRE {
        bigint id PK
        string short_name
        string abbreviation
        string tire_type
        string manufactor_name
    }

    CONSTRUCTOR ||--o{ CAR : has
    CIRCUIT ||--o{ CIRCUIT_VERSION : has
    COMPETITION ||--o{ SEASON : includes
    SEASON ||--o{ EVENT : includes
    REGULATORY_SYSTEM ||--o{ EVENT : governs
    CIRCUIT ||--o{ EVENT : hosts
    EVENT ||--o{ EVENT_ENTRY : includes
    EVENT ||--o{ SESSION : schedules
    EVENT ||--o{ EVENT_CHAMPIONSHIP : maps
    EVENT ||--o{ DRIVER_STANDING : ranks
    CAR ||--o{ EVENT_ENTRY : used_by
    DRIVER ||--o{ EVENT_ENTRY : drives
    DRIVER ||--o{ DRIVER_STANDING : ranks
    TEAM ||--o{ EVENT_ENTRY : fields
    TIRE ||--o{ EVENT_ENTRY : uses
    CHAMPIONSHIP ||--o{ EVENT_CHAMPIONSHIP : groups
    SESSION ||--o{ SESSION_RESULT : records
    EVENT_ENTRY ||--o{ SESSION_RESULT : results
