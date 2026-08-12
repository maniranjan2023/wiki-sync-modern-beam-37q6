# TruWiki

## 1. What I Built

I built **TruWiki**, an internal knowledge and documentation system that connects company sources like **Slack and Jira** with a centralized, verified Wiki.

The idea is simple:

> Instead of employees searching through Slack messages, Jira tickets, and scattered documentation manually, they can ask a question and get an answer from trusted company knowledge.

TruWiki currently supports:

- **Slack** as a knowledge source
- **Jira** as a knowledge source
- A centralized **Wiki** for verified information
- **Slack `/ask-wiki` slash command** for asking questions directly from Slack
- Role-based access for **Admin, Owner, and Viewer**
- Wiki verification and source tracking
- Answers with supporting sources
- Drift detection to identify potentially outdated Wiki information

The system is designed to support more sources in the future, including:

- GitHub
- Linear
- Google Drive
- Notion
- Confluence
- Other internal knowledge sources

---

## 2. What Problem Does TruWiki Solve?

In a real company, information is usually scattered across different tools.

For example:

- A technical decision may be discussed in Slack.
- A requirement may exist in Jira.
- Architecture information may live in documentation.
- An important decision may be buried inside an old conversation.
- Existing documentation may become outdated as the system changes.

This creates a simple but frustrating problem:

> **People spend too much time looking for information instead of using it.**

For example, a developer may ask:

> "What database is ShopFlow migrating to?"

Without TruWiki, they might need to:

1. Search Slack.
2. Search Jira.
3. Open multiple messages and tickets.
4. Check whether the information is still valid.
5. Compare conflicting information.
6. Decide which source to trust.

With TruWiki, they can simply ask:

```text
/ask-wiki What database is ShopFlow migrating to?
```

And get:

```text
Question
What database is ShopFlow migrating to?

Answer
ShopFlow is migrating its primary database
from PostgreSQL to MongoDB.

Source
ShopFlow Architecture › Database
```

So TruWiki is not just another AI chatbot.

The goal is:

> **Make company knowledge easy to find, easy to verify, and trustworthy enough to use.**

---

## 3. How TruWiki Works

At a high level:

```text
Company Sources
      ↓
Slack / Jira
      ↓
Ingestion
      ↓
Processing & Indexing
      ↓
TruWiki
      ↓
User Question
      ↓
Search Relevant Knowledge
      ↓
Generate Answer
      ↓
Answer + Sources
```

The important part is that TruWiki does not simply ask an LLM to generate an answer from general knowledge.

It first searches the company's connected and verified knowledge.

This makes the answers relevant to the actual organization.

---

## 4. User Roles

TruWiki currently has three main roles:

- **Admin**
- **Owner**
- **Viewer**

Each role has a different responsibility.

---

## 5. Admin User Flow

The Admin manages the overall TruWiki system.

### Admin can:

- Create sources
- Edit sources
- Delete sources
- Connect Slack
- Connect Jira
- Import and index source data
- Run drift scans
- Review findings
- Approve or reject proposed changes
- Manage the knowledge pipeline

The Admin is mainly responsible for keeping the knowledge system healthy and up to date.

### Admin Flow

#### Step 1 — Open TruWiki

The Admin logs into the TruWiki dashboard.

They can see connected sources and their current status.

Example:

```text
Sources

Slack        Connected
Jira         Connected
GitHub       Coming Soon
Linear       Coming Soon
Google Drive Coming Soon
```

#### Step 2 — Connect a Source

The Admin connects a source such as Slack or Jira.

For example:

```text
Admin
  ↓
Connect Slack
  ↓
Authorize
  ↓
Source Connected
```

#### Step 3 — Import & Index

The Admin can click:

**Import & Index**

TruWiki fetches relevant information from the source and processes it for the Wiki.

For example:

```text
Slack
  ↓
Messages
  ↓
Relevant information
  ↓
Processing
  ↓
Wiki knowledge
```

#### Step 4 — Run Drift Scan

The Admin can run a **Drift Scan** to identify information that may no longer match the current state of the company.

For example, the Wiki might say:

```text
Database: PostgreSQL
```

But recent Slack/Jira information may say:

```text
We have started migrating from PostgreSQL to MongoDB.
```

TruWiki can identify this as a potential mismatch.

#### Step 5 — Review Queue

Potential changes are added to the Review Queue.

The Admin or Owner can compare:

```text
Existing Wiki
      vs
New Evidence
```

They can then:

- Approve
- Reject
- Review later

This prevents new information from automatically overwriting trusted knowledge.

---

## 6. Owner User Flow

The **Owner** is responsible for the correctness of knowledge related to their area.

For example:

- Engineering Owner
- Product Owner
- Infrastructure Owner

The Owner acts as the **human verification layer**.

### Owner can:

- Review proposed changes
- Inspect supporting evidence
- Compare existing Wiki information with new evidence
- Approve changes
- Reject changes
- Help keep their team's knowledge accurate

### Owner Flow

```text
New Finding
     ↓
Owner Reviews Evidence
     ↓
Compare with Existing Wiki
     ↓
Approve / Reject
     ↓
Wiki Updated if Approved
```

#### Example

Existing Wiki:

> ShopFlow uses PostgreSQL.

New source evidence:

> "The PostgreSQL → MongoDB migration started in August 2026."

The Owner checks the evidence.

If correct:

```text
Approve
```

TruWiki can update the verified knowledge.

If incorrect:

```text
Reject
```

This creates a **human-in-the-loop knowledge verification process**.

---

## 7. Viewer User Flow

The Viewer is primarily a knowledge consumer.

They can:

- Browse the Wiki
- Search the Wiki
- Read verified information
- Ask questions from Slack
- View the sources behind answers

They cannot modify the knowledge base.

### Viewer Flow — Web

The Viewer opens TruWiki and searches for information.

Example:

```text
Search:
ShopFlow database
```

TruWiki returns the relevant verified Wiki information.

### Viewer Flow — Slack

The Viewer can also ask TruWiki directly from Slack.

They don't need to open another application.

They simply type:

```text
/ask-wiki What database is ShopFlow migrating to?
```

TruWiki processes the question and returns:

```text
Checking the verified wiki…

Question
What database is ShopFlow migrating to?

Answer
ShopFlow is migrating its primary database
from PostgreSQL to MongoDB.

Detail
• Migration started in August 2026
• PostgreSQL is the current database
• MongoDB is the target database

Sources
• ShopFlow Architecture › Database
```

This makes the knowledge available directly inside the user's existing workflow.

---

## 8. `/ask-wiki` Slack Slash Command

One of the key features of TruWiki is the Slack slash command:

```text
/ask-wiki <question>
```

The goal is to make company knowledge accessible without leaving Slack.

### Example

The user asks:

```text
/ask-wiki What payment provider does ShopFlow use?
```

Slack sends the command and question to TruWiki.

The backend then:

```text
Receive Question
      ↓
Search TruWiki
      ↓
Find Relevant Knowledge
      ↓
Generate Answer
      ↓
Attach Sources
      ↓
Return Answer to Slack
```

The response looks like:

```text
Checking the verified wiki…

Question
What payment provider does ShopFlow use?

Answer
ShopFlow uses Stripe for payment processing.

Sources
• ShopFlow Architecture › Payments
```

Showing the original **Question** is important because the user can immediately confirm that TruWiki answered the correct question.

---

## 9. Why Sources Matter

A major focus of TruWiki is **trust**.

An AI-generated answer alone is not enough for important internal company information.

A user should be able to ask:

> "Where did this answer come from?"

That's why TruWiki returns supporting sources.

For example:

```text
Answer
ShopFlow uses Stripe for payment processing.

Source
ShopFlow Architecture › Payments
```

This gives users a way to verify the answer instead of blindly trusting the AI.

The core principle is:

> **Answer + Evidence > Answer alone**

---

## 10. Current Integrations

### Slack

Slack contains a lot of useful company knowledge that is often difficult to find later.

For example:

```text
Engineer:
"We are moving ShopFlow from PostgreSQL to MongoDB."

Manager:
"The migration starts this month."
```

This conversation can become useful evidence for the Wiki.

### Jira

Jira provides more structured information, such as:

- Tasks
- Requirements
- Bugs
- Engineering work
- Project decisions
- Status updates

Slack + Jira give TruWiki both **conversational knowledge** and **structured project knowledge**.

---

## 11. Future Integrations

TruWiki is designed as a **multi-source knowledge layer**, so adding more sources should not require rebuilding the entire system.

### GitHub

Potential knowledge:

- Repositories
- Pull Requests
- Issues
- Technical discussions
- Code changes
- Architecture decisions

Example:

```text
/ask-wiki Why was the payment service changed?
```

TruWiki could combine information from GitHub, Slack, and Jira to answer it.

### Linear

Useful for:

- Product issues
- Engineering tasks
- Project planning
- Roadmaps
- Product decisions

### Google Drive

Useful for:

- Documents
- PDFs
- Specifications
- Reports
- Internal documentation

### Other Possible Sources

The same architecture can eventually support:

- Notion
- Confluence
- GitLab
- Microsoft Teams
- Internal databases
- Internal APIs
- Other company documentation systems

The long-term vision is:

```text
Slack
Jira
GitHub
Linear
Google Drive
Notion
Confluence
       ↓
Unified Knowledge Layer
       ↓
     TruWiki
       ↓
Search / Web Wiki / Slack
```

---

## 12. Why the Verification Layer Matters

One important design decision in TruWiki is that **not everything found in a source should automatically become trusted knowledge**.

For example, someone might write in Slack:

> "I think we're moving to MongoDB."

That is evidence, but it may not be enough to change the official Wiki.

TruWiki separates:

**Source Evidence**

from

**Verified Knowledge**

The process becomes:

```text
Raw Source
    ↓
Evidence
    ↓
Potential Change
    ↓
Human Review
    ↓
Verified Knowledge
```

This helps prevent incorrect, speculative, or outdated information from automatically becoming official documentation.

---

## 13. End-to-End Example

Imagine a new developer joins the ShopFlow team.

They want to know:

> "What payment provider does ShopFlow use?"

Instead of asking another engineer or searching multiple systems, they can use:

```text
/ask-wiki What payment provider does ShopFlow use?
```

TruWiki searches its verified knowledge.

It finds:

```text
ShopFlow Architecture › Payments
```

The verified information says:

> ShopFlow uses Stripe for payment processing.

Slack returns:

```text
Question
What payment provider does ShopFlow use?

Answer
ShopFlow uses Stripe for payment processing.

Source
ShopFlow Architecture › Payments
```

The developer gets the answer quickly and can verify where the information came from.

---

## 14. What I Actually Solved

TruWiki addresses four major problems.

### 1. Information is scattered

Company knowledge exists across Slack, Jira, documents, and other systems.

**TruWiki:** Brings important information into one searchable knowledge layer.

### 2. Finding information is slow

Employees waste time searching old messages, tickets, and documents.

**TruWiki:** Lets users ask questions using natural language.

### 3. AI answers can be difficult to trust

A generated answer without evidence can be misleading.

**TruWiki:** Provides answers backed by verified Wiki knowledge and sources.

### 4. Documentation becomes outdated

The actual system changes, but documentation often doesn't.

**TruWiki:** Uses drift scans to identify possible mismatches and sends them through human review.

---

## 15. Product Vision

The long-term goal of **TruWiki** is to become a company's **trusted knowledge layer**.

Instead of employees thinking:

> "Where is this information?"

They should be able to think:

> **"Ask TruWiki."**

The experience should eventually look like:

```text
                         Company Sources
                                │
          ┌─────────────────────┼─────────────────────┐
          ↓                     ↓                     ↓
        Slack                  Jira                 GitHub
          ↓                     ↓                     ↓
          └─────────────────────┼─────────────────────┘
                                ↓
                       Knowledge Pipeline
                                ↓
                           TruWiki
                                ↓
                 ┌──────────────┴──────────────┐
                 ↓                             ↓
              Web Wiki                     Slack Bot
                 ↓                             ↓
          Browse / Search             /ask-wiki <question>
                 │                             │
                 └──────────────┬──────────────┘
                                ↓
                         Answer + Evidence
```

The core idea is simple:

> **Connect company knowledge → verify it → keep it fresh → make it searchable → let people ask questions naturally.**

That is what I built with **TruWiki**.
