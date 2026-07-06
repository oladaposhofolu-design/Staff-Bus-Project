'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const port = process.env.PORT || 3000;
const rootDir = __dirname;
const publicDir = path.join(rootDir, 'public');
const dataDir = path.join(rootDir, 'data');
const routesDataPath = path.join(dataDir, 'routes.json');
const adminDataPath = path.join(dataDir, 'admin-data.json');

function readJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function mergeData(baseData, adminData) {
  const merged = JSON.parse(JSON.stringify(baseData));
  if (adminData && Array.isArray(adminData.buses)) {
    const existingIds = new Set(merged.buses.map((bus) => bus.id));
    adminData.buses.forEach((bus) => {
      if (existingIds.has(bus.id)) {
        merged.buses = merged.buses.map((item) => (item.id === bus.id ? bus : item));
      } else {
        merged.buses.push(bus);
      }
      existingIds.add(bus.id);
    });
  }
  if (adminData && Array.isArray(adminData.busStops)) {
    const existingStopIds = new Set(merged.busStops.map((stop) => stop.id));
    adminData.busStops.forEach((stop) => {
      if (existingStopIds.has(stop.id)) {
        merged.busStops = merged.busStops.map((item) => (item.id === stop.id ? stop : item));
      } else {
        merged.busStops.push(stop);
      }
      existingStopIds.add(stop.id);
    });
  }
  return merged;
}

function getMergedData() {
  const baseData = readJson(routesDataPath, { buses: [], busStops: [] });
  const adminData = readJson(adminDataPath, { buses: [], busStops: [] });
  return mergeData(baseData, adminData);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function serveStaticFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
  }[ext] || 'text/plain; charset=utf-8';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
}

function handleApi(req, res, url) {
  const pathname = url.pathname;

  if (pathname === '/api/buses' && req.method === 'GET') {
    const data = getMergedData();
    sendJson(res, 200, { buses: data.buses, busStops: data.busStops });
    return true;
  }

  if (pathname === '/api/routes/morning' && req.method === 'GET') {
    const data = getMergedData();
    const morningRoutes = data.buses.filter((bus) => bus.routeType === 'Morning' || bus.routeType === 'Both');
    sendJson(res, 200, { routes: morningRoutes });
    return true;
  }

  if (pathname === '/api/routes/afternoon' && req.method === 'GET') {
    const data = getMergedData();
    const afternoonRoutes = data.buses.filter((bus) => bus.routeType === 'Afternoon' || bus.routeType === 'Both');
    sendJson(res, 200, { routes: afternoonRoutes });
    return true;
  }

  if (pathname.startsWith('/api/bus/') && req.method === 'GET') {
    const busId = pathname.split('/').pop();
    const data = getMergedData();
    const bus = data.buses.find((item) => item.id.toLowerCase() === busId.toLowerCase());
    if (!bus) {
      sendJson(res, 404, { error: 'Bus not found' });
    } else {
      sendJson(res, 200, { bus });
    }
    return true;
  }

  if (pathname === '/api/admin/buses' && req.method === 'POST') {
    parseJsonBody(req)
      .then((body) => {
        const data = getMergedData();
        const newBus = {
          id: body.id || `SB-${String(data.buses.length + 101).padStart(3, '0')}`,
          name: body.name || 'Unnamed Bus',
          driverName: body.driverName || 'TBD',
          departureTime: body.departureTime || '06:30',
          destination: body.destination || 'Unknown',
          routeType: body.routeType || 'Morning',
          region: body.region || 'Central',
          morningSchedule: body.morningSchedule || [],
          afternoonSchedule: body.afternoonSchedule || [],
          stops: body.stops || [],
          notes: body.notes || 'No extra notes.'
        };
        const adminData = readJson(adminDataPath, { buses: [], busStops: [] });
        adminData.buses = [...(adminData.buses || []), newBus];
        writeJson(adminDataPath, adminData);
        sendJson(res, 201, { bus: newBus });
      })
      .catch((error) => sendJson(res, 400, { error: error.message }));
    return true;
  }

  if (pathname === '/api/admin/buses' && req.method === 'GET') {
    const data = getMergedData();
    sendJson(res, 200, { buses: data.buses });
    return true;
  }

  // Update an existing bus (admin)
  if (pathname.startsWith('/api/admin/buses/') && req.method === 'PUT') {
    const busId = pathname.split('/').pop();
    parseJsonBody(req)
      .then((body) => {
        const baseData = readJson(routesDataPath, { buses: [], busStops: [] });
        const adminData = readJson(adminDataPath, { buses: [], busStops: [] });

        const idLower = (busId || '').toLowerCase();

        // Find in admin overrides first
        let existingIndex = adminData.buses.findIndex((b) => (b.id || '').toLowerCase() === idLower);
        if (existingIndex >= 0) {
          adminData.buses[existingIndex] = { ...adminData.buses[existingIndex], ...body, id: adminData.buses[existingIndex].id };
        } else {
          // If not in admin overrides but exists in base, create an override entry
          const baseBus = baseData.buses.find((b) => (b.id || '').toLowerCase() === idLower);
          if (baseBus) {
            adminData.buses = adminData.buses || [];
            adminData.buses.push({ ...baseBus, ...body, id: baseBus.id });
          } else {
            // If bus doesn't exist anywhere, return 404
            sendJson(res, 404, { error: 'Bus not found' });
            return;
          }
        }

        writeJson(adminDataPath, adminData);

        // Return the updated bus (merged)
        const merged = mergeData(baseData, adminData);
        const updated = merged.buses.find((b) => (b.id || '').toLowerCase() === idLower);
        sendJson(res, 200, { bus: updated });
      })
      .catch((error) => sendJson(res, 400, { error: error.message }));
    return true;
  }

  return false;
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.url.startsWith('/api/')) {
    if (handleApi(req, res, requestUrl)) {
      return;
    }
    sendJson(res, 404, { error: 'API endpoint not found' });
    return;
  }

  let requestedPath = requestUrl.pathname;
  if (requestedPath === '/') {
    requestedPath = '/index.html';
  } else if (requestedPath === '/buses') {
    requestedPath = '/buses.html';
  } else if (requestedPath === '/morning') {
    requestedPath = '/morning.html';
  } else if (requestedPath === '/afternoon') {
    requestedPath = '/afternoon.html';
  } else if (requestedPath === '/details') {
    requestedPath = '/details.html';
  } else if (requestedPath === '/search') {
    requestedPath = '/search.html';
  } else if (requestedPath === '/admin') {
    requestedPath = '/admin.html';
  }

  const filePath = path.join(publicDir, requestedPath);
  if (!filePath.startsWith(publicDir)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  serveStaticFile(res, filePath);
});

server.listen(port, () => {
  console.log(`Staff bus portal running at http://localhost:${port}`);
});
