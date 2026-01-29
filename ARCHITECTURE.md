# Email Service Architecture

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          THE INTERNET                            │
└────┬────────────────────────────────────────────────────────────┘
     │
     │ SMTP (Port 25)          HTTP (Port 3000)
     │                         
┌────┴─────────────────────────────────────────────────────────────┐
│                      EMAIL SERVICE (Node.js)                     │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ SMTP Server  │  │   Express    │  │  Web Server  │           │
│  │ (Port 25)    │  │   API        │  │  (Port 3000) │           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │
│         │                 │                  │                   │
│         └─────────────────┼──────────────────┘                   │
│                           │                                      │
│                    ┌──────▼────────┐                            │
│                    │  API Routes   │                            │
│                    │  • Accounts   │                            │
│                    │  • Emails     │                            │
│                    │  • Drafts     │                            │
│                    └──────┬────────┘                            │
│                           │                                     │
│                    ┌──────▼─────────┐                           │
│                    │  Database      │                           │
│                    │  Layer (db.js) │                           │
│                    └──────┬─────────┘                           │
│                           │                                     │
└───────────────────────────┼─────────────────────────────────────┘
                            │
                    ┌───────▼──────────┐
                    │    SUPABASE      │
                    │   (PostgreSQL)   │
                    │                  │
                    │  • accounts      │
                    │  • emails        │
                    │  • drafts        │
                    └──────────────────┘
```

## Data Flow

### Receiving an Email
```
External Email Server
        │
        │ SMTP Connection (Port 25)
        │
        ▼
┌─────────────────────┐
│  SMTP Server        │
│  (smtp-server.js)   │
└────────┬────────────┘
         │
         │ Parse Email
         │ Extract: From, To, Subject, Body
         │
         ▼
┌─────────────────────┐
│  Email Parser       │
│  (mailparser)       │
└────────┬────────────┘
         │
         │ Find Account
         │
         ▼
┌──────────────────────┐
│  Database            │
│  (Supabase)          │
│  Look up account by  │
│  recipient email     │
└────────┬─────────────┘
         │
         │ Save Email
         │
         ▼
┌──────────────────────┐
│  emails table        │
│  • Marked as READ    │
│  • direction: recv   │
│  • timestamp added   │
└────────┬─────────────┘
         │
         │ User's Inbox
         │ Updated!
         │
         ▼
   Browser Refreshes
   Every 10 seconds
```

### Sending an Email
```
User Interface
(public/index.html)
        │
        │ Click Send
        │ Fill: To, Subject, Body
        │
        ▼
┌──────────────────┐
│  JavaScript      │
│  POST /api/send  │
└────────┬─────────┘
         │
         │
         ▼
┌──────────────────┐
│  Express.js      │
│  api-routes.js   │
│  POST /send      │
└────────┬─────────┘
         │
         │ Get Account
         │
         ▼
┌──────────────────┐
│  Database Lookup │
│  Get user email  │
└────────┬─────────┘
         │
         │
         ▼
┌──────────────────┐
│  Email Sender    │
│  nodemailer      │
│  sendEmail()     │
└────────┬─────────┘
         │
         │ Send via SMTP
         │
         ▼
┌──────────────────┐
│  SMTP Relay      │
│  (configured)    │
└────────┬─────────┘
         │
         │ Save to Sent
         │
         ▼
┌──────────────────┐
│  Database        │
│  emails table    │
│  direction: sent │
└────────┬─────────┘
         │
         │ Return Success
         │
         ▼
   UI Shows: Email Sent!
```

### Reading an Email
```
User Clicks Email
        │
        │
        ▼
┌──────────────────┐
│  JavaScript      │
│  readEmail(id)   │
│  GET /email/:id  │
└────────┬─────────┘
         │
         │
         ▼
┌──────────────────┐
│  Express Route   │
│  api-routes.js   │
│  GET /email/:id  │
└────────┬─────────┘
         │
         │ Get from DB
         │
         ▼
┌──────────────────┐
│  Database Query  │
│  emails table    │
│  WHERE id = ?    │
└────────┬─────────┘
         │
         │ Mark as Read
         │
         ▼
┌──────────────────┐
│  Database Update │
│  is_read = true  │
└────────┬─────────┘
         │
         │ Return Email
         │ Data
         │
         ▼
   Display in Email Reader
   - From
   - To
   - Subject
   - HTML/Text Body
```

## File Interaction Diagram

```
┌──────────────────┐
│  server.js       │
│  (Main Entry)    │
└────────┬─────────┘
         │
         ├─→ db.js (Database)
         │
         ├─→ smtp-server.js (SMTP)
         │
         ├─→ email-sender.js (Send)
         │
         ├─→ api-routes.js (API)
         │
         └─→ public/index.html (Web UI)

api-routes.js
├─→ db.js (All queries)
└─→ email-sender.js (Send emails)

smtp-server.js
└─→ mailparser (Parse emails)
    └─→ db.js (Save to database)

email-sender.js
└─→ nodemailer (SMTP client)

public/index.html
├─→ Calls api-routes endpoints
└─→ Displays UI
```

## Database Schema Diagram

```
┌─────────────────────┐
│     accounts        │
├─────────────────────┤
│ id (UUID)           │ ◄─────┐
│ email (TEXT)        │       │
│ password (TEXT)     │       │
│ created_at (TS)     │       │
└─────────────────────┘       │
                              │
                    ┌─────────┴──────────┐
                    │                    │
          ┌─────────▼─────────┐  ┌──────▼────────────┐
          │     emails        │  │     drafts        │
          ├───────────────────┤  ├───────────────────┤
          │ id (UUID)         │  │ id (UUID)         │
          │ account_id (FK)   │  │ account_id (FK)   │
          │ from_address      │  │ to_address        │
          │ to_address        │  │ subject           │
          │ subject           │  │ body              │
          │ body              │  │ created_at        │
          │ html_body         │  └───────────────────┘
          │ direction         │
          │ is_read           │
          │ created_at        │
          └───────────────────┘

Indexes:
- emails.account_id
- emails.created_at DESC
- drafts.account_id
- accounts.email
```

## Request/Response Flow

### Create Account Flow
```
POST /api/accounts/create
{
  "email": "user@example.com",
  "password": "password123"
}
     │
     ▼
Check if email exists
     │
     ├─ Yes → 400 Error: Account exists
     │
     └─ No → Create new account
           │
           ▼
        Database INSERT
           │
           ▼
        Return Success
        {
          "success": true,
          "accountId": "uuid...",
          "email": "user@example.com"
        }
```

### Send Email Flow
```
POST /api/send
{
  "accountId": "uuid",
  "to": "recipient@example.com",
  "subject": "Hello",
  "body": "Message content"
}
     │
     ▼
Validate fields
     │
     ├─ Invalid → 400 Error
     │
     └─ Valid → Get account
              │
              ▼
           Get user email
              │
              ▼
           Send via nodemailer
              │
              ├─ Success → Save to Sent folder
              │           │
              │           ▼
              │        Return success
              │
              └─ Error → Save as Draft
                        │
                        ▼
                     Return error with draftId
```

## Technology Stack

```
┌─────────────────────────────────┐
│    Frontend Layer               │
├─────────────────────────────────┤
│ HTML5 + CSS3 + Vanilla JS       │
│ No external frameworks          │
│ Responsive design               │
│ Real-time updates (polling)     │
└────────────────────┬────────────┘
                     │
┌────────────────────▼────────────┐
│    Backend Layer (Node.js)      │
├─────────────────────────────────┤
│ Express.js (HTTP Server)        │
│ SMTP Server (Email Reception)   │
│ API Routes                      │
│ Email Sender (Nodemailer)       │
└────────────────────┬────────────┘
                     │
┌────────────────────▼────────────┐
│    Database Layer               │
├─────────────────────────────────┤
│ Supabase (PostgreSQL)           │
│ Cloud-based                     │
│ RESTful API                     │
│ Real-time subscriptions         │
└─────────────────────────────────┘
```

---

This architecture provides a complete, scalable email service with clear separation of concerns.
