# Requirements Document

## Introduction

The Furniture CRM application currently manages database schema changes through Prisma's integrated migration system, where migrations are tightly coupled with the main application codebase. This feature separates database migration functionality into an independent module, allowing database schema changes to be managed, versioned, and executed independently from application deployment cycles. This separation enables safer database updates, supports multi-environment deployments, and provides better control over schema evolution.

## Glossary

- **Migration_System**: The independent module responsible for managing database schema changes
- **Migration_File**: A versioned SQL or Prisma migration file containing schema change instructions
- **Migration_Registry**: A database table or storage mechanism tracking which migrations have been applied
- **Application**: The main Furniture CRM application (Next.js/React frontend and backend)
- **Database**: The PostgreSQL database containing CRM data
- **Schema_Version**: A unique identifier for a specific database schema state
- **Migration_Runner**: The component that executes migration files against the database
- **Rollback_Handler**: The component that reverts applied migrations
- **Migration_Status**: The execution state of a migration (pending, applied, failed, rolled_back)
- **Lock_Manager**: The component preventing concurrent migration execution
- **Migration_Validator**: The component that checks migration file syntax and safety

## Requirements

### Requirement 1: Independent Migration Module

**User Story:** As a DevOps engineer, I want database migrations to be executable independently from application deployment, so that I can manage schema changes separately from code changes.

#### Acceptance Criteria

1. THE Migration_System SHALL exist as a separate module with its own entry point executable as a standalone command
2. THE Migration_System SHALL be invokable via command-line interface without starting the Application
3. THE Migration_System SHALL connect to the Database using connection parameters from environment variables (DATABASE_URL, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)
4. WHEN the Migration_System executes, THE Migration_System SHALL complete without requiring Application dependencies to be loaded
5. THE Migration_System SHALL expose a command-line interface with commands: migrate, rollback, status, create, validate
6. WHEN the Migration_System connects to the Database, THE Migration_System SHALL apply a connection timeout of 30 seconds
7. IF the Database connection fails, THEN THE Migration_System SHALL exit with exit code 1 and output an error message to stderr specifying the connection failure reason
8. IF required environment variables are missing, THEN THE Migration_System SHALL exit with exit code 2 and output a message to stderr listing the missing variables
9. WHEN both missing environment variables and database connection failures occur, THE Migration_System SHALL check environment variables before attempting database connection and exit with code 2
10. WHEN the Migration_System completes successfully, THE Migration_System SHALL exit with exit code 0

### Requirement 2: Migration File Management

**User Story:** As a developer, I want to create and organize migration files in a structured way, so that schema changes are versioned and traceable.

#### Acceptance Criteria

1. THE Migration_System SHALL store Migration_Files in a dedicated migrations directory located in the project root
2. WHEN a new migration is created, THE Migration_System SHALL generate a Migration_File with a timestamp-based filename format `YYYYMMDDHHmmss_{description}.sql` with second precision
3. THE Migration_File SHALL contain both upgrade SQL statements and downgrade SQL statements in separate sections marked by `-- UPGRADE` and `-- DOWNGRADE` comments
4. THE Migration_System SHALL validate Migration_File naming follows the pattern: `{timestamp}_{description}.sql` where timestamp is 14 digits (YYYYMMDDHHmmss) and description is 1-100 alphanumeric characters with underscores
5. WHEN a Migration_File does not follow the naming pattern, THE Migration_System SHALL reject the file immediately upon first detection with an error message specifying the violation
6. THE Migration_System SHALL reject Migration_Files with duplicate timestamps by refusing to create or execute them
7. IF a Migration_File with a duplicate timestamp is detected, THEN THE Migration_System SHALL output an error message indicating the conflicting timestamp
8. THE Migration_System SHALL support both SQL and Prisma migration file formats

### Requirement 3: Migration Registry Tracking

**User Story:** As a database administrator, I want to track which migrations have been applied, so that I can understand the current schema state and migration history.

#### Acceptance Criteria

1. THE Migration_System SHALL maintain a Migration_Registry table in the Database with schema: (id, filename, checksum, applied_at, execution_duration_ms, status)
2. WHEN a migration is applied, THE Migration_System SHALL record the migration timestamp, filename, checksum (SHA-256 hash of file contents), and execution time in milliseconds in the Migration_Registry
3. THE Migration_Registry SHALL store the Migration_Status for each migration using values: "pending", "applied", "failed", "rolled_back"
4. THE Migration_System SHALL record the Schema_Version (defined as the filename of the most recently applied migration) after each successful migration
5. WHEN queried, THE Migration_System SHALL return the list of applied migrations in chronological order sorted by applied_at timestamp ascending
6. THE Migration_Registry SHALL persist checksum values for each Migration_File to detect modifications
7. THE Migration_System SHALL record the Migration_Status for each migration using values: "pending", "applied", "failed", "rolled_back"
8. WHEN a migration has an error message to record, THE Migration_System SHALL store it in an error_message column
9. WHEN a Migration_File checksum does not match the stored checksum in the Migration_Registry for an already-applied migration, THE Migration_System SHALL reject execution with an error message indicating checksum mismatch

### Requirement 4: Migration Execution

**User Story:** As a DevOps engineer, I want to apply pending migrations to the database, so that the schema stays synchronized with application requirements.

#### Acceptance Criteria

1. WHEN the migrate command is invoked, THE Migration_Runner SHALL identify all pending Migration_Files (files in migrations directory not present in Migration_Registry with status "applied")
2. THE Migration_Runner SHALL execute pending migrations in chronological order based on timestamp extracted from filename
3. WHEN a migration executes successfully, THE Migration_Runner SHALL update the Migration_Registry with status "applied", execution timestamp, and execution duration
4. IF a migration execution fails, THEN THE Migration_Runner SHALL halt execution without attempting remaining migrations and record Migration_Status as "failed" with error details
5. WHEN a migration fails, THE Migration_Runner SHALL preserve all previously applied migrations in the Migration_Registry without modification
6. THE Migration_Runner SHALL execute each migration within a database transaction with isolation level READ COMMITTED
7. IF a migration transaction fails, THEN THE Migration_Runner SHALL rollback that specific migration's changes automatically
8. WHEN all pending migrations have been processed by the migrate command, THE Migration_Runner SHALL output a success message listing the count of applied migrations and exit with code 0
9. WHEN the migrate command is invoked and no pending migrations exist, THE Migration_Runner SHALL output "No pending migrations" and exit with code 0
10. WHEN the migrate command completes, THE Migration_Runner SHALL atomically update the Migration_Registry for each migration (no partial updates)

### Requirement 5: Migration Rollback

**User Story:** As a database administrator, I want to revert applied migrations, so that I can recover from problematic schema changes.

#### Acceptance Criteria

1. WHEN the rollback command is invoked without arguments, THE Rollback_Handler SHALL identify the most recently applied migration (highest applied_at timestamp in Migration_Registry with status "applied")
2. THE Rollback_Handler SHALL read the downgrade statements from the Migration_File identified by the migration's filename
3. IF the Migration_File cannot be read, THEN THE Rollback_Handler SHALL exit with error code 3 and output an error message to stderr indicating file access failure
4. WHEN rollback completes successfully, THE Rollback_Handler SHALL update the migration entry in the Migration_Registry with status "rolled_back" and rollback timestamp
5. IF rollback fails during SQL execution, THEN THE Rollback_Handler SHALL record Migration_Status as "failed" with error details and halt execution without attempting further rollbacks
6. THE Rollback_Handler SHALL support rolling back multiple migrations by count (e.g., `rollback --count=3`) or target Schema_Version (e.g., `rollback --to=20240115120000`)
7. WHEN rolling back multiple migrations, THE Rollback_Handler SHALL execute rollbacks in reverse chronological order (most recent first)
8. THE Rollback_Handler SHALL execute each rollback operation within a database transaction with isolation level READ COMMITTED
9. IF a rollback transaction fails, THEN THE Rollback_Handler SHALL rollback that transaction and halt without attempting remaining rollbacks
10. WHEN the rollback command is invoked with --count parameter, THE Rollback_Handler SHALL validate the count is a positive integer and does not exceed the number of applied migrations
11. IF the --count parameter is invalid, THEN THE Rollback_Handler SHALL exit with error code 2 and output an error message to stderr
12. WHEN the rollback command is invoked with --to parameter, THE Rollback_Handler SHALL validate the target Schema_Version exists in Migration_Registry with status "applied"
13. WHEN the target version is valid and applied, THE Rollback_Handler SHALL proceed with the rollback operation
14. IF the --to parameter references a Schema_Version that is not found in Migration_Registry, THEN THE Rollback_Handler SHALL halt immediately and exit with error code 2 and output an error message to stderr

### Requirement 6: Concurrent Execution Prevention

**User Story:** As a DevOps engineer, I want to prevent multiple migration processes from running simultaneously, so that migrations are not applied in conflicting or duplicate ways.

#### Acceptance Criteria

1. WHEN the Migration_Runner starts, THE Lock_Manager SHALL acquire an exclusive lock on the Migration_Registry
2. IF another migration process holds the lock, THEN THE Migration_System SHALL wait up to 60 seconds for lock acquisition
3. IF the lock cannot be acquired within 60 seconds, THEN THE Migration_System SHALL exit with an error message indicating a lock timeout
4. WHEN the Lock_Manager completes migration execution or migration operations complete, THE Lock_Manager SHALL release the exclusive lock
5. WHEN no lock exists during a release operation, THE Lock_Manager SHALL complete the release operation successfully without error
6. IF the Migration_Runner process terminates unexpectedly, THEN THE Lock_Manager SHALL release the lock within 10 seconds

### Requirement 7: Migration File Validation

**User Story:** As a developer, I want migration files to be validated before execution, so that syntax errors and unsafe operations are caught early.

#### Acceptance Criteria

1. WHEN a migration is about to execute, THE Migration_Validator SHALL parse the Migration_File for SQL syntax errors
2. THE Migration_Validator SHALL detect missing downgrade statements and issue a warning
3. THE Migration_Validator SHALL identify potentially destructive operations (DROP TABLE, DROP COLUMN, TRUNCATE)
4. WHEN destructive operations are detected, THE Migration_Validator SHALL require explicit confirmation before proceeding
5. THE Migration_Validator SHALL verify the Migration_File checksum matches the stored checksum in the Migration_Registry

### Requirement 8: Migration Status Reporting

**User Story:** As a DevOps engineer, I want to view the current migration status, so that I can verify schema state before and after deployments.

#### Acceptance Criteria

1. WHEN the status command is invoked, THE Migration_System SHALL display all Migration_Files and their Migration_Status
2. THE Migration_System SHALL indicate which migrations are pending, applied, or failed
3. THE Migration_System SHALL display the current Schema_Version
4. THE Migration_System SHALL show the timestamp and execution duration for each applied migration
5. WHERE a migration has failed, THE Migration_System SHALL display the error message and stack trace

### Requirement 9: Environment-Specific Configuration

**User Story:** As a DevOps engineer, I want to configure the migration system for different environments, so that I can safely manage migrations across development, staging, and production databases.

#### Acceptance Criteria

1. THE Migration_System SHALL read Database connection settings from environment variables
2. THE Migration_System SHALL support configuration of migration file directory path via environment variables
3. WHERE a dry-run flag is provided, THE Migration_System SHALL simulate migration execution without applying changes
4. THE Migration_System SHALL support a verbose logging mode via configuration flag
5. WHERE in production mode, THE Migration_System SHALL require explicit confirmation for destructive operations
6. THE Migration_System SHALL validate required environment variables are present before execution

### Requirement 10: Integration with Existing Prisma Migrations

**User Story:** As a developer, I want the separate migration system to work with existing Prisma migrations, so that I can transition smoothly without losing migration history.

#### Acceptance Criteria

1. WHEN initializing the Migration_System, THE Migration_System SHALL detect existing Prisma migration history
2. THE Migration_System SHALL import existing Prisma migration records into the Migration_Registry
3. THE Migration_System SHALL preserve Prisma migration timestamps and ordering
4. THE Migration_System SHALL support executing both Prisma-generated and custom SQL migrations
5. WHEN a Prisma migration exists, THE Migration_System SHALL execute it using Prisma's migration engine
6. THE Migration_System SHALL maintain compatibility with Prisma's migration file format

### Requirement 11: Error Handling and Logging

**User Story:** As a database administrator, I want detailed logs of migration execution, so that I can troubleshoot failures and audit schema changes.

#### Acceptance Criteria

1. WHEN a migration executes, THE Migration_System SHALL log the migration filename, timestamp, and status
2. IF an error occurs, THEN THE Migration_System SHALL log the complete error message and stack trace
3. THE Migration_System SHALL write logs to both console output and a log file
4. THE Migration_System SHALL include database connection details (excluding password) in log output
5. WHEN in verbose mode, THE Migration_System SHALL log each SQL statement before execution
6. THE Migration_System SHALL log lock acquisition and release events

### Requirement 12: Idempotent Migration Operations

**User Story:** As a DevOps engineer, I want migration operations to be idempotent, so that running migrations multiple times does not cause errors or data corruption.

#### Acceptance Criteria

1. WHEN a migration has already been applied, THE Migration_System SHALL skip re-execution
2. THE Migration_System SHALL verify migration checksums match before declaring a migration as already applied
3. WHEN a migration file has been modified after application, THE Migration_System SHALL treat it as a new migration with the current timestamp
4. THE Migration_System SHALL report skipped migrations with a clear message indicating they were already applied
5. WHEN all migrations are current, THE Migration_System SHALL exit with status code 0
