import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
    vus: 10,        // 10 virtual users
    duration: '30s', // Run for 30 seconds
};

export default function () {
    let response = http.get('https://httpbin.org/get');
    
    check(response, {
        'status is 200': (r) => r.status === 200,
    });
    
    sleep(1);
}