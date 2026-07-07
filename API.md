# DMARC Report Manager API Documentation

The DMARC Report Manager provides a FastAPI-based backend for processing, storing, and visualizing DMARC reports.

## Base URL
The backend usually runs on `http://localhost:8000`.

## Authentication

Most endpoints require authentication via a **JWT (JSON Web Token)**. 

1. **Obtain a token**: Send a `POST` request to `/api/login`.
2. **Use the token**: Include it in the `Authorization` header of your requests:
   ```http
   Authorization: Bearer <your_access_token>
   ```

> [!NOTE]
> Public access is limited. `GET /api/stats` can be called without a token but will hide sensitive domain names; all file, report, and domain endpoints require authentication.


## Endpoints

### 1. General Info

#### `GET /`
Check if the backend is running.

**Example:**
```bash
curl http://localhost:8000/
```
**Response:**
```json
{"message": "DMARC Report Manager Backend is running"}
```

#### `GET /api/version`
Get the current application version.

**Example:**
```bash
curl http://localhost:8000/api/version
```
**Response:**
```json
{"version": "0.2.0"}
```

---

### 2. Authentication & Profile

#### `POST /api/login`
Authenticate and receive a JWT token.

**Request:**
```json
{
  "username": "admin",
  "password": "yourpassword"
}
```

**Response:**
```json
{
  "access_token": "eyJhbG...",
  "token_type": "bearer",
  "user": { ... }
}
```

#### `GET /api/user/profile`
Get the current user's profile information. (Requires Auth)

#### `PUT /api/user/profile`
Update the current user's profile (name, email, phone, or password). (Requires Auth)


---

### 3. File Management

#### `POST /api/upload`
Upload DMARC XML files (optionally gzipped or zipped). Files are automatically processed into the database upon upload.
(Requires Auth)

**Request:**
- Content-Type: `multipart/form-data`
- Body: `files` (array of files)

**Example:**
```bash
curl -F "files=@report.xml" http://localhost:8000/api/upload
```

#### `GET /api/files`
List all uploaded files in the storage directory.
(Requires Auth)

**Example:**
```bash
curl http://localhost:8000/api/files
```

#### `DELETE /api/files/{filename}`
Delete a specific uploaded file from storage (does not delete processed records from the DB).
(Requires Auth)

**Example:**
```bash
curl -X DELETE http://localhost:8000/api/files/google.com!example.com!1712345678.xml
```

#### `POST /api/fetch-email`
Run one email retrieval pass using the configured IMAP or POP3 account, save matching report attachments, and process them.
(Requires Auth)

**Example:**
```bash
curl -X POST http://localhost:8000/api/fetch-email
```

---

### 4. Email Monitoring

#### `GET /api/email-monitor`
Get monitor status, including enabled/running state, interval, last run, next run, and last result.
(Requires Auth)

#### `POST /api/email-monitor/run`
Run one email monitoring pass immediately.
(Requires Auth)

#### `POST /api/email-monitor/start`
Enable and start automatic email monitoring.
(Requires Admin)

#### `POST /api/email-monitor/stop`
Disable and stop automatic email monitoring.
(Requires Admin)

#### `GET /api/settings` / `PUT /api/settings`
Global settings include email monitoring configuration:

- `email_protocol`: `imap` or `pop3`
- `imap_host`, `imap_port`, `imap_user`, `imap_pass`, `imap_use_ssl`
- `email_mailbox`: IMAP mailbox name
- `email_only_unread`: IMAP unread-only mode
- `email_delete_after_fetch`: POP3 delete-after-download mode
- `email_monitor_enabled`: automatic monitor enabled flag
- `email_check_interval_minutes`: automatic monitor interval

---

### 5. Reports & Analytics

#### `GET /api/stats`
Get aggregated statistics for the dashboard.
Public (optional Auth)

**Query Parameters:**
- `start` (optional): Unix timestamp (seconds)
- `end` (optional): Unix timestamp (seconds)

**Example:**
```bash
curl "http://localhost:8000/api/stats?start=1704067200"
```

#### `GET /api/reports`
Get a paginated list of processed reports.
(Requires Auth)

**Query Parameters:**
- `page` (default: 1): Page number
- `limit` (default: 50): Items per page
- `search` (optional): Filter by org name or report ID
- `domain` (optional): Filter by domain

**Example:**
```bash
curl "http://localhost:8000/api/reports?domain=example.com"
```

#### `GET /api/reports/{id}`
Get full details for a specific report, including its individual records.
The `id` can be the internal numerical ID or the unique `report_id` string.
(Requires Auth)

**Example:**
```bash
curl http://localhost:8000/api/reports/123
```

#### `DELETE /api/reports`
Bulk delete reports from the database based on filters.
(Requires Auth)

**Query Parameters:**
- `days`: Delete reports older than X days
- `domain`: Delete reports for a specific domain
- `org_name`: Delete reports from a specific organization
- `start`/`end`: Delete reports within a date range

**Example:**
```bash
curl -X DELETE "http://localhost:8000/api/reports?days=90"
```

#### `GET /api/domains`
Get a list of all unique domains with aggregated performance stats.
(Requires Auth)

**Example:**
```bash
curl http://localhost:8000/api/domains
```

---

### 6. User Management (Admin Only)

#### `GET /api/users`
List all user accounts in the system. (Requires Admin)

#### `POST /api/users`
Create a new user account. (Requires Admin)

**Request:**
```json
{
  "username": "newuser",
  "password": "password123",
  "first_name": "New",
  "last_name": "User",
  "email": "new@example.com",
  "role": "user"
}
```

#### `DELETE /api/users/{id}`
Delete a user account by its numerical ID. (Requires Admin)

---

## Testing API Usage


You can use the provided testing script located in `tests/test_api.py` to verify these endpoints.

To run tests:
```bash
pytest tests/test_api.py
```
