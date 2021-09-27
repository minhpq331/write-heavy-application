# Testing write heavy application

Write some write-heavy application using nodejs and test with k6.io

## Requirement

- NodeJS >= 12
- Yarn
- MongoDB
- [k6.io](https://k6.io)

## Run the tests

Prepare environment:

```bash
# Change environment variables
cp .env.example .env

# Install dependencies
yarn
```

Run API server:

```bash
# Express
node express-insert.js

# Koa
node koa-insert.js
```

Run API test:

```bash
# Empty GET
k6 run --vus 100 --iterations 100000 k6_scripts/empty_get.js

# Empty POST
k6 run --vus 100 --iterations 100000 k6_scripts/empty_post.js

# Insert Sync
ENDPOINT=insert_sync k6 run --vus 100 --iterations 100000 k6_scripts/insert.js 

# Insert Async
ENDPOINT=insert_async k6 run --vus 100 --iterations 100000 k6_scripts/insert.js 

# Insert group
ENDPOINT=insert_group k6 run --vus 100 --iterations 100000 k6_scripts/insert.js 

# Insert bulk
ENDPOINT=insert_bulk k6 run --vus 100 --iterations 100000 k6_scripts/insert.js 
```

Run Raw test:

```bash
# Insert Sync
node raw-insert.js insert_sync 100000

# Insert Async
node raw-insert.js insert_async 100000

# Insert group
node raw-insert.js insert_group 100000

# Insert bulk
node raw-insert.js insert_bulk 100000
```