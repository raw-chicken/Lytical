import {
  app, protocol, Menu, BrowserWindow,
} from 'electron';
// eslint-disable-next-line import/no-extraneous-dependencies
import { createProtocol } from 'vue-cli-plugin-electron-builder/lib';
// eslint-disable-next-line import/no-extraneous-dependencies
import installExtension, { VUEJS3_DEVTOOLS } from 'electron-devtools-installer';

const Store = require('electron-store');

const store = new Store();

const isDevelopment = process.env.NODE_ENV !== 'production';
const { ipcMain } = require('electron');

// My exports
const lcu = require('./res/lcu');
const request = require('./res/request');

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } },
]);

let win;
const puuidStore = {};

async function createWindow() {
  // Create the browser window.
  const options = {
    show: false,
    width: 1200,
    height: 650,
    webPreferences: {
      // Use pluginOptions.nodeIntegration, leave this alone
      // eslint-disable-next-line max-len
      // See nklayman.github.io/vue-cli-plugin-electron-builder/guide/security.html#node-integration
      // for more info
      nodeIntegration: true,
      contextIsolation: false,
    },
    icon: './public/favicon.ico',
  };
  Object.assign(options, store.get('winBounds'));
  win = new BrowserWindow(options);

  if (process.env.WEBPACK_DEV_SERVER_URL) {
    // Load the url of the dev server if in development mode
    await win.loadURL(process.env.WEBPACK_DEV_SERVER_URL);
    if (!process.env.IS_TEST) win.webContents.openDevTools();
  } else {
    createProtocol('app');
    // Load the index.html when not in development
    win.loadURL('app://./index.html');
  }
  win.on('close', () => {
    store.set('winBounds', win.getBounds());
    win.destroy();
  });
}

Menu.setApplicationMenu(null);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  if (isDevelopment && !process.env.IS_TEST) {
    // Install Vue Devtools
    try {
      await installExtension(VUEJS3_DEVTOOLS);
    } catch (e) {
      console.error('Vue Devtools failed to install:', e.toString());
    }
  }

  createWindow();
  // eslint-disable-next-line global-require
  if (require('electron-squirrel-startup')) return;
  win.once('ready-to-show', win.show);
});

// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === 'win32') {
    process.on('message', (data) => {
      if (data === 'graceful-exit') {
        app.quit();
      }
    });
  } else {
    process.on('SIGTERM', () => {
      app.quit();
    });
  }
}

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

// In main process.

function createReply(dataD, id) {
  let reply = {};
  try {
    reply = JSON.parse(dataD);
  } catch {
    reply = dataD;
  }
  reply.reply_type = id;
  return reply;
}
/**
const WebSocket = require('ws');
function connectToWebsocket() {
  // Connect to websocket
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;
  lcu.getLCUAuth().then((auth) => {
    const ws = new WebSocket(`wss://riot:${auth.password}@127.0.0.1:${auth.port}/`, 'wamp');
    ws.on('open', () => {
    // Subsribe to [Ingame, Lobby, Matchmaking] events
      ws.send('[5, "OnJsonApiEvent_lol-gameflow_v1_session"]');
    });

    ws.on('error', (err) => {
      console.log(err);
    });

    ws.on('message', (msg) => {
      console.log(JSON.parse(msg));
    });
  });
}
*/

function errorHandler(errorCode, event) {
  console.log('ERRORCODE: ', errorCode);
  switch (String(errorCode)) {
    case '400':
    case '404': {
      // GOOD REQUEST. BAD RESPONSE
      // e.g. checking lobby status when
      // no lobby exists. Just do nothing..
      event.reply('asynchronous-reply', { reply_type: 'lcu-reconnected' });
      break;
    }
    case '403':
    case 'ECONNREFUSED':
    case '0':
    default: {
      // Unhadled Error..
      lcu.setAuth(null);
      event.reply('asynchronous-reply', { reply_type: 'lcu-disonnceted' });
      break;
    }
  }
}

// Used to get PUUID for many differet requests.
function getSummonerByName(name, auth) {
  const summonerName = encodeURI(name.replace(/\s/g, ''));
  if (puuidStore[name]) {
    return new Promise((resolve) => {
      resolve(puuidStore[name]);
    });
  }
  return new Promise((resolve, reject) => {
    request.requestURL(
      auth,
      `/lol-summoner/v1/summoners?name=${summonerName}`,
    ).then((summoner) => {
      puuidStore[name] = JSON.parse(summoner);
      resolve(puuidStore[name]);
    }).catch((error) => { reject(error); });
  });
}

function getSummonerById(id, auth) {
  if (puuidStore[id]) {
    return new Promise((resolve) => {
      resolve(puuidStore[id]);
    });
  }
  return new Promise((resolve, reject) => {
    request.requestURL(
      auth,
      `/lol-summoner/v1/summoners/${id}`,
    ).then((summoner) => {
      puuidStore[id] = JSON.parse(summoner);
      resolve(puuidStore[id]);
    }).catch((error) => { reject(error); });
  });
}

function getSummonerCurrent(auth) {
  if (puuidStore['summoner.current']) {
    return new Promise((resolve) => {
      resolve(puuidStore['summoner.current']);
    });
  }
  return new Promise((resolve, reject) => {
    request.requestURL(
      auth,
      '/lol-summoner/v1/current-summoner',
    ).then((summoner) => {
      puuidStore['summoner.current'] = JSON.parse(summoner);
      resolve(puuidStore['summoner.current']);
    }).catch((error) => { reject(error); });
  });
}

ipcMain.on('asynchronous-message', (event, req) => {
  console.log('NEW REQUEST: ', req);

  // ipc required requests for debug/versioning
  if (req.id === 'openDevTools') {
    win.webContents.openDevTools();
    return;
  }
  if (req.id === 'getVersion') {
    event.reply('asynchronous-reply', { reply_type: 'appVersion', version: app.getVersion() });
    return;
  }
  if (req.id === 'scaleUp') {
    win.webContents.setZoomFactor(win.webContents.getZoomFactor() + 0.1);
    return;
  }
  if (req.id === 'scaleDown') {
    win.webContents.setZoomFactor(win.webContents.getZoomFactor() - 0.1);
    return;
  }
  if (req.id === 'getRunLevel') {
    event.reply('asynchronous-reply', { reply_type: 'runLevel', isAdmin: lcu.getRunLevel() });
    return;
  }

  // LCU related Requests
  lcu.getLCUAuth().then((auth) => {
    switch (req.id) {
      case 'liveclientdata-playerlist': {
        const url = '/liveclientdata/playerlist';
        const config = {
          protocol: 'https',
          port: 2999,
        };
        request.requestURL(config, url).then((data) => {
          event.reply(
            'asynchronous-reply',
            createReply(data, req.id),
          );
        }).catch((error) => {
          if (String(error) !== 'ECONNREFUSED') {
            console.log(error);
          }
        });
        break;
      }
      case 'lol-lobby-playercard': {
        let rankedData = null;
        getSummonerById(req.summonerId, auth)
          .then((summoner) => {
            request.requestURL(
              auth,
              `/lol-ranked/v1/ranked-stats/${summoner.puuid}`,
            ).then((rankedD) => {
              rankedData = JSON.parse(rankedD);
              rankedData.username = summoner.displayName;
              request.requestURL(
                auth,
                `/lol-match-history/v1/products/lol/${summoner.puuid}/matches?begIndex=0&endIndex=9`,
              ).then(
                (matchHistory) => {
                  rankedData.teamId = req.teamId;
                  rankedData.position = req.pos;
                  rankedData.matchHistory = JSON.parse(matchHistory);
                  event.reply(
                    'asynchronous-reply',
                    createReply(rankedData, req.id),
                  );
                },
              );
            });
          }).catch((error) => errorHandler(error, event));
        break;
      }
      case 'lol-match-playercard': {
        let rankedData = null;
        getSummonerByName(req.summonerName, auth)
          .then((summoner) => {
            request.requestURL(
              auth,
              `/lol-ranked/v1/ranked-stats/${summoner.puuid}`,
            ).then((rankedD) => {
              rankedData = JSON.parse(rankedD);
              rankedData.username = summoner.displayName;
              request.requestURL(
                auth,
                `/lol-match-history/v1/products/lol/${summoner.puuid}/matches?begIndex=0&endIndex=9`,
              ).then(
                (matchHistory) => {
                  rankedData.teamId = req.teamId;
                  rankedData.championId = req.championId;
                  rankedData.position = req.position;
                  rankedData.matchHistory = JSON.parse(matchHistory);
                  event.reply(
                    'asynchronous-reply',
                    createReply(rankedData, req.id),
                  );
                },
              );
            });
          }).catch((error) => errorHandler(error, event));
        break;
      }
      case 'lol-champ-select': {
        request.requestURL(
          auth,
          '/lol-champ-select/v1/session',
        ).then((data) => {
          event.reply('asynchronous-reply', createReply(data, req.id));
        }).catch((error) => errorHandler(error, event));
        break;
      }
      case 'lol-match-history-current': {
        request.requestURL(
          auth,
          // eslint-disable-next-line max-len
          `/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=${req.begIndex}&endIndex=${req.endIndex}`,
        ).then((data) => {
          event.reply('asynchronous-reply', createReply(data, req.id));
        }).catch((error) => errorHandler(error, event));
        break;
      }
      case 'lol-match-history': {
        getSummonerByName(req.user, auth)
          .then((summoner) => {
            request.requestURL(
              auth,
              // eslint-disable-next-line max-len
              `/lol-match-history/v1/products/lol/${summoner.puuid}/matches?begIndex=${req.begIndex}&endIndex=${req.endIndex}`,
            ).then(
              (matchHistory) => {
                event.reply(
                  'asynchronous-reply',
                  createReply(matchHistory, req.id),
                );
              },
            );
          }).catch((error) => errorHandler(error, event));
        break;
      }
      case 'lol-match-details': {
        request.requestURL(
          auth,
          `/lol-match-history/v1/games/${req.gameId}`,
        ).then((data) => {
          event.reply('asynchronous-reply', createReply(data, req.id));
        }).catch((error) => errorHandler(error, event));
        break;
      }
      case 'lol-ranked-stats-current': {
        event.reply('asynchronous-reply', createReply({}, 'clear-profile'));
        getSummonerCurrent(auth).then((summoner) => {
          request.requestURL(
            auth,
            '/lol-ranked/v1/current-ranked-stats',
          ).then((rankedD) => {
            const rankData = JSON.parse(rankedD);
            rankData.summonerData = summoner;
            rankData.username = summoner.displayName;
            event.reply('asynchronous-reply', createReply(rankData, req.id));
          });
        }).catch((error) => errorHandler(error, event));
        break;
      }
      case 'lol-ranked-stats': {
        event.reply('asynchronous-reply', createReply({}, 'clear-profile'));
        getSummonerByName(req.user, auth)
          .then((summoner) => {
            request.requestURL(
              auth,
              `/lol-ranked/v1/ranked-stats/${summoner.puuid}`,
            ).then(
              (rankedD) => {
                const rankData = JSON.parse(rankedD);
                rankData.summonerData = summoner;
                rankData.username = summoner.displayName;
                event.reply('asynchronous-reply', createReply(rankData, req.id));
              },
            );
          }).catch((error) => errorHandler(error, event));
        break;
      }
      case 'lol-ranked-stats-match-details': {
        getSummonerByName(req.user, auth)
          .then((summoner) => {
            request.requestURL(
              auth,
              `/lol-ranked/v1/ranked-stats/${summoner.puuid}`,
            ).then(
              (rankedD) => {
                const rankData = JSON.parse(rankedD);
                rankData.summonerData = summoner;
                rankData.username = summoner.displayName;
                rankData.index = req.index;
                rankData.gameId = req.gameId;
                event.reply('asynchronous-reply', createReply(rankData, req.id));
              },
            );
          }).catch((error) => errorHandler(error, event));
        break;
      }
      case 'lol-full-ranked-history-current': {
        getSummonerCurrent(auth)
          .then((summoner) => {
            request.requestURL(
              auth,
              // This is capped at 200 Games internally. If the player refreshes late into the season we
              // Could iterate backwards with an older start index but I don't really care..
              // Timing: Takes 2345.318800000474ms
              `/lol-match-history/v1/products/lol/${summoner.puuid}/matches?begIndex=0&endIndex=200`,
            ).then(
              (matchHistory) => {
                event.reply(
                  'asynchronous-reply',
                  createReply(matchHistory, req.id),
                );
              },
            );
          }).catch((error) => errorHandler(error, event));
        break;
      }
      case 'lol-full-ranked-history': {
        getSummonerByName(req.user, auth)
          .then((summoner) => {
            request.requestURL(
              auth,
              `/lol-match-history/v1/products/lol/${summoner.puuid}/matches?begIndex=0&endIndex=200`,
            ).then(
              (matchHistory) => {
                event.reply(
                  'asynchronous-reply',
                  createReply(matchHistory, req.id),
                );
              },
            );
          }).catch((error) => errorHandler(error, event));
        break;
      }
      default: {
        event.reply('asynchronous-reply', createReply(null, req.id));
      }
    }
  });
});
