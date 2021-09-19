import http from 'k6/http';

import { check, sleep } from 'k6';

export default function () {
    let res = http.post(
        `http://localhost:3000/${__ENV.ENDPOINT}`,
        JSON.stringify({
            id: Math.floor(Math.random() * 1000),
            title: 'My awesome test',
            description: 'This is a test',
        }),
        { headers: { 'Content-Type': 'application/json' } }
    );

    check(res, { 'status was 200': (r) => r.status == 200 });
}
