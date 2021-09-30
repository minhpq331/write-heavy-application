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

## Test Result

On my laptop with:

- Ubuntu 20
- 2 cores 4 threads
- 12GB RAM
- 256GB SSD
- MongoDB on Docker

| No. | Framework | Test         | Http time (s) | Additional time (s) | Http RPS | Ops RPS | avg(ms) | min(ms) | max(ms) | p95(ms) | Mongo CPU |
|-----|-----------|--------------|---------------|---------------------|----------|---------|---------|---------|---------|---------|-----------|
| 1   | Express   | Empty GET    | 18.2          |                     | 5498     |         | 18.14   | 0.28    | 69.61   | 26.91   |           |
| 2   | Express   | Empty POST   | 24.8          |                     | 4026     |         | 24.79   | 1.72    | 121.99  | 30.66   |           |
| 3   | Raw       | Insert Sync  | 38.2          |                     | 2620     |         |         |         |         |         | 52.00%    |
| 4   | Raw       | Insert Group | 12.1          |                     | 8264     |         |         |         |         |         | 135.00%   |
| 5   | Express   | Insert Sync  | 50.9          |                     | 1962     |         | 50.9    | 20.14   | 246.78  | 73.77   | 36.00%    |
| 6   | Express   | Insert Async | 42.3          | 8.5                 | 2361     | 1968    | 42.28   | 3.97    | 177.93  | 64.02   | 35.00%    |
| 7   | Express   | Insert Group | 25.1          | 12.3                | 3982     | 2673    | 25.07   | 1.36    | 102.99  | 31.21   | 135.00%   |
| 8   | Raw       | Insert Bulk  | 0.89          |                     | 111607   |         |         |         |         |         | 35.00%    |
| 9   | Express   | Insert Bulk  | 26.7          | 1                   | 3742     | 3610    | 26.66   | 2.1     | 96.82   | 35.78   | 3.00%     |
| 10  | Koa       | Empty GET    | 9.6           |                     | 10363    |         | 9.6     | 0.24    | 88.92   | 20.07   |           |
| 11  | Koa       | Empty POST   | 12.1          |                     | 8251     |         | 12.08   | 0.24    | 97.1    | 21.75   |           |
| 12  | Koa       | Insert Sync  | 35.3          |                     | 2835     |         | 35.23   | 12.67   | 183.13  | 53.01   | 52.00%    |
| 13  | Koa       | Insert Async | 29            | 7.5                 | 3452     | 2740    | 28.91   | 0.9     | 166.67  | 53.21   | 50.00%    |
| 14  | Koa       | Insert Group | 12.5          | 12.2                | 8017     | 4048    | 12.42   | 0.28    | 86.66   | 24.71   | 130.00%   |
| 15  | Koa       | Insert Bulk  | 13.3          | 1                   | 7515     | 6993    | 13.26   | 0.32    | 85.47   | 24.28   | 8.00%     |