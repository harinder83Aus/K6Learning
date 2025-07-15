import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { htmlParser } from 'k6/html';

// Custom metrics
const errorRate = new Rate('error_rate');
const pageLoadTime = new Trend('page_load_time');
const apiResponseTime = new Trend('api_response_time');
const checkoutErrors = new Counter('checkout_errors');

// Configuration
const BASE_URL = 'http://localhost:9090';

// Test scenarios configuration
export const options = {
  scenarios: {
    // Smoke test - Light load to verify basic functionality
    smoke_test: {
      executor: 'constant-vus',
      vus: 1,
      duration: '30s',
      tags: { test_type: 'smoke' },
      exec: 'smokeTest',
    },
    
    // Load test - Normal expected load
    load_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 10 },  // Ramp up to 10 users
        { duration: '5m', target: 10 },  // Stay at 10 users
        { duration: '2m', target: 20 },  // Ramp up to 20 users
        { duration: '5m', target: 20 },  // Stay at 20 users
        { duration: '2m', target: 0 },   // Ramp down
      ],
      tags: { test_type: 'load' },
      exec: 'loadTest',
    },
    
    // Stress test - High load to find breaking point
    stress_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 20 },  // Ramp up to 20 users
        { duration: '5m', target: 20 },  // Stay at 20 users
        { duration: '2m', target: 40 },  // Ramp up to 40 users
        { duration: '5m', target: 40 },  // Stay at 40 users
        { duration: '2m', target: 60 },  // Ramp up to 60 users
        { duration: '5m', target: 60 },  // Stay at 60 users
        { duration: '2m', target: 0 },   // Ramp down
      ],
      tags: { test_type: 'stress' },
      exec: 'stressTest',
    },
    
    // Spike test - Sudden load increase
    spike_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 5 },   // Normal load
        { duration: '30s', target: 50 },  // Spike!
        { duration: '1m', target: 5 },    // Back to normal
      ],
      tags: { test_type: 'spike' },
      exec: 'spikeTest',
    },
  },
  
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests should be below 2s
    http_req_failed: ['rate<0.05'],    // Error rate should be below 5%
    error_rate: ['rate<0.1'],          // Custom error rate should be below 10%
    page_load_time: ['p(95)<3000'],    // 95% of page loads should be below 3s
    api_response_time: ['p(95)<1000'], // 95% of API calls should be below 1s
  },
};

// Test data
const testProducts = [
  'men-jacket',
  'women-dress',
  'kids-shoes',
  'accessories',
];

const testUsers = [
  { email: 'test1@example.com', password: 'password123' },
  { email: 'test2@example.com', password: 'password123' },
  { email: 'demo@evershop.io', password: '123456' },
];

// Utility functions
function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function getCSRFToken(response) {
  const doc = htmlParser(response.body);
  const csrfInput = doc.find('input[name="_token"]');
  return csrfInput.length > 0 ? csrfInput.first().attr('value') : null;
}

// Test scenarios
export function smokeTest() {
  const startTime = Date.now();
  
  // Test homepage
  let response = http.get(`${BASE_URL}/`);
  check(response, {
    'Homepage loads successfully': (r) => r.status === 200,
    'Homepage contains title': (r) => r.body.includes('EverShop') || r.body.includes('Welcome'),
  });
  
  pageLoadTime.add(Date.now() - startTime);
  errorRate.add(response.status !== 200);
  
  sleep(1);
}

export function loadTest() {
  const startTime = Date.now();
  
  // Homepage visit
  let response = http.get(`${BASE_URL}/`);
  check(response, {
    'Homepage status is 200': (r) => r.status === 200,
  });
  
  sleep(Math.random() * 2 + 1); // Random sleep 1-3 seconds
  
  // Browse products
  response = http.get(`${BASE_URL}/products`);
  check(response, {
    'Products page loads': (r) => r.status === 200,
  });
  
  sleep(Math.random() * 2 + 1);
  
  // Search functionality
  const searchTerm = randomItem(['jacket', 'dress', 'shoes', 'accessories']);
  response = http.get(`${BASE_URL}/search?q=${searchTerm}`);
  check(response, {
    'Search works': (r) => r.status === 200,
  });
  
  sleep(Math.random() * 2 + 1);
  
  // Product detail page
  const productSlug = randomItem(testProducts);
  response = http.get(`${BASE_URL}/product/${productSlug}`);
  check(response, {
    'Product detail loads': (r) => r.status === 200,
  });
  
  pageLoadTime.add(Date.now() - startTime);
  errorRate.add(response.status !== 200);
  
  sleep(1);
}

export function stressTest() {
  const startTime = Date.now();
  
  // Simulate user journey
  const userJourney = [
    () => http.get(`${BASE_URL}/`),
    () => http.get(`${BASE_URL}/products`),
    () => http.get(`${BASE_URL}/categories`),
    () => http.get(`${BASE_URL}/search?q=test`),
    () => http.get(`${BASE_URL}/product/${randomItem(testProducts)}`),
  ];
  
  // Execute random user actions
  for (let i = 0; i < 3; i++) {
    const action = randomItem(userJourney);
    const response = action();
    
    check(response, {
      'Request successful': (r) => r.status === 200,
    });
    
    errorRate.add(response.status !== 200);
    sleep(0.5);
  }
  
  pageLoadTime.add(Date.now() - startTime);
}

export function spikeTest() {
  // Simulate intensive user behavior during spike
  const startTime = Date.now();
  
  // Rapid fire requests
  const requests = [
    http.get(`${BASE_URL}/`),
    http.get(`${BASE_URL}/products`),
    http.get(`${BASE_URL}/api/products`),
    http.get(`${BASE_URL}/categories`),
  ];
  
  const responses = http.batch(requests);
  
  responses.forEach((response, index) => {
    check(response, {
      [`Batch request ${index + 1} successful`]: (r) => r.status === 200,
    });
    errorRate.add(response.status !== 200);
  });
  
  pageLoadTime.add(Date.now() - startTime);
}

// Advanced test scenarios
export function ecommerceUserJourney() {
  const startTime = Date.now();
  
  // 1. Homepage visit
  let response = http.get(`${BASE_URL}/`);
  check(response, { 'Homepage loads': (r) => r.status === 200 });
  sleep(2);
  
  // 2. Browse categories
  response = http.get(`${BASE_URL}/categories`);
  check(response, { 'Categories page loads': (r) => r.status === 200 });
  sleep(1);
  
  // 3. View product listing
  response = http.get(`${BASE_URL}/products`);
  check(response, { 'Products page loads': (r) => r.status === 200 });
  sleep(2);
  
  // 4. View product details
  const productSlug = randomItem(testProducts);
  response = http.get(`${BASE_URL}/product/${productSlug}`);
  check(response, { 'Product detail loads': (r) => r.status === 200 });
  sleep(3);
  
  // 5. Add to cart (simulate)
  const addToCartAPI = `${BASE_URL}/api/cart/add`;
  const apiStartTime = Date.now();
  response = http.post(addToCartAPI, {
    productId: '1',
    quantity: '1'
  }, {
    headers: { 'Content-Type': 'application/json' }
  });
  
  apiResponseTime.add(Date.now() - apiStartTime);
  check(response, { 'Add to cart API': (r) => r.status === 200 || r.status === 201 });
  sleep(1);
  
  // 6. View cart
  response = http.get(`${BASE_URL}/cart`);
  check(response, { 'Cart page loads': (r) => r.status === 200 });
  sleep(2);
  
  // 7. Checkout process (first step)
  response = http.get(`${BASE_URL}/checkout`);
  check(response, { 'Checkout page loads': (r) => r.status === 200 });
  
  if (response.status !== 200) {
    checkoutErrors.add(1);
  }
  
  pageLoadTime.add(Date.now() - startTime);
  sleep(1);
}

// API-focused tests
export function apiPerformanceTest() {
  const apiStartTime = Date.now();
  
  // Test various API endpoints
  const apiTests = [
    { name: 'Products API', url: `${BASE_URL}/api/products` },
    { name: 'Categories API', url: `${BASE_URL}/api/categories` },
    { name: 'Search API', url: `${BASE_URL}/api/search?q=test` },
  ];
  
  apiTests.forEach(test => {
    const response = http.get(test.url);
    check(response, {
      [`${test.name} responds successfully`]: (r) => r.status === 200,
      [`${test.name} response time OK`]: (r) => r.timings.duration < 1000,
    });
    
    apiResponseTime.add(response.timings.duration);
    errorRate.add(response.status !== 200);
  });
  
  sleep(0.5);
}

// Setup and teardown
export function setup() {
  console.log('🚀 Starting EverShop performance tests...');
  console.log(`Target URL: ${BASE_URL}`);
  
  // Warmup request
  const warmupResponse = http.get(`${BASE_URL}/`);
  if (warmupResponse.status !== 200) {
    console.warn('⚠️  Warmup request failed. Server might not be ready.');
  }
  
  return { timestamp: Date.now() };
}

export function teardown(data) {
  console.log('✅ Performance tests completed');
  console.log(`Test duration: ${(Date.now() - data.timestamp) / 1000}s`);
}

// Default export for simple execution
export default function() {
  loadTest();
}