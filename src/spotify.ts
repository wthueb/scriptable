type Playlist = string;

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const REDIRECT_URI = 'https://dummy-redirect-uri-for-scriptable.com/callback';

const REFRESH_TOKEN_KEY = 'spotify-refresh-token';

const SCOPES = [
  'user-read-playback-state',
  'user-library-read',
  'user-library-modify',
  'playlist-read-private',
  'playlist-modify-public',
  'playlist-modify-private',
].join(' ');

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

export class RefreshTokenExpiredError extends Error {
  constructor(message = 'Spotify refresh token expired') {
    super(message);
    this.name = 'RefreshTokenExpiredError';
  }
}

function parseQuery(url: string) {
  const result: { [key: string]: string | undefined } = {};
  const start = url.indexOf('?');

  if (start === -1) {
    return result;
  }

  for (const pair of url.slice(start + 1).split('&')) {
    const eq = pair.indexOf('=');
    const key = eq === -1 ? pair : pair.slice(0, eq);
    const value = eq === -1 ? '' : pair.slice(eq + 1);
    result[decodeURIComponent(key)] = decodeURIComponent(value);
  }

  return result;
}

function canPresentUI() {
  //return config.runsInApp || config.runsInActionExtension;
  return true;
}

export class Spotify {
  clientId: string;
  clientSecret: string;

  accessToken = '';

  private refreshToken: string;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.refreshToken = Keychain.contains(REFRESH_TOKEN_KEY) ? Keychain.get(REFRESH_TOKEN_KEY) : '';
  }

  private setRefreshToken(token: string) {
    this.refreshToken = token;
    Keychain.set(REFRESH_TOKEN_KEY, token);
  }

  async authenticate() {
    if (!this.refreshToken) {
      await this.authorize();
      return;
    }

    try {
      await this.updateToken();
    } catch (e) {
      if (!(e instanceof RefreshTokenExpiredError)) {
        throw e;
      }

      await this.authorize();
    }
  }

  async updateToken() {
    const req = new Request(TOKEN_URL);

    req.method = 'post';

    req.headers = {
      Authorization: `Basic ${btoa(this.clientId + ':' + this.clientSecret)}`,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    req.body = `grant_type=refresh_token&refresh_token=${encodeURIComponent(this.refreshToken)}`;

    const resp: TokenResponse = await req.loadJSON();

    if (!resp.access_token) {
      if (resp.error === 'invalid_grant') {
        throw new RefreshTokenExpiredError(resp.error_description ?? resp.error);
      }

      throw new Error(resp.error_description ?? resp.error ?? 'could not refresh access token');
    }

    this.accessToken = resp.access_token;

    if (resp.refresh_token) {
      this.setRefreshToken(resp.refresh_token);
    }
  }

  async authorize() {
    if (!canPresentUI()) {
      throw new Error(
        'Spotify needs authorization. Open this script in the Scriptable app and run it to sign in.',
      );
    }

    const code = await this.getAuthorizationCode();
    const token = await this.exchangeCode(code);

    if (!token.refresh_token) {
      throw new Error(
        token.error_description ?? token.error ?? 'no refresh token returned by Spotify',
      );
    }

    this.setRefreshToken(token.refresh_token);

    if (token.access_token) {
      this.accessToken = token.access_token;
    }
  }

  private async getAuthorizationCode(): Promise<string> {
    const state = UUID.string();
    const webView = new WebView();

    return new Promise((resolve) => {
      webView.shouldAllowRequest = (request) => {
        if (!request.url.startsWith(REDIRECT_URI)) {
          return true;
        }

        const params = parseQuery(request.url);

        if (params.error) {
          throw new Error(`authorization failed: ${params.error}`);
        }

        if (!params.code) {
          throw new Error('authorization was canceled');
        }

        if (params.state !== state) {
          throw new Error('state mismatch; aborting');
        }

        resolve(params.code);

        return false;
      };

      const query = [
        `client_id=${encodeURIComponent(this.clientId)}`,
        'response_type=code',
        `redirect_uri=${encodeURIComponent(REDIRECT_URI)}`,
        `scope=${encodeURIComponent(SCOPES)}`,
        `state=${encodeURIComponent(state)}`,
      ].join('&');

      const authorization_url = `${AUTHORIZE_URL}?${query}`;

      webView.loadURL(authorization_url);
      webView.present(false);
    });
  }

  private async exchangeCode(code: string): Promise<TokenResponse> {
    const req = new Request(TOKEN_URL);

    req.method = 'post';

    req.headers = {
      Authorization: `Basic ${btoa(this.clientId + ':' + this.clientSecret)}`,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    req.body = [
      'grant_type=authorization_code',
      `code=${encodeURIComponent(code)}`,
      `redirect_uri=${encodeURIComponent(REDIRECT_URI)}`,
    ].join('&');

    return req.loadJSON();
  }

  async getCurrentTrack() {
    // https://developer.spotify.com/documentation/web-api/reference/#/operations/get-information-about-the-users-current-playback
    const req = new Request('https://api.spotify.com/v1/me/player');

    req.method = 'get';

    req.headers = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
    };

    const data = await req.load();

    if (req.response.statusCode === 204) {
      return undefined;
    }

    const resp: SpotifyApi.CurrentlyPlayingResponse = JSON.parse(data.toRawString());

    if (resp.item === null || !('artists' in resp.item)) {
      return undefined;
    }

    return resp.item;
  }

  // async getCurrentTrack() {
  //   // https://developer.spotify.com/documentation/web-api/reference/#/operations/get-the-users-currently-playing-track
  //   const req = new Request(
  //     "https://api.spotify.com/v1/me/player/currently-playing"
  //   );
  //
  //   req.method = "get";
  //
  //   req.headers = {
  //     Authorization: `Bearer ${this.accessToken}`,
  //     Accept: "application/json",
  //   };
  //
  //   const data = await req.load();
  //
  //   if (req.response.statusCode !== 200) {
  //     throw new Error("no track playing");
  //   }
  //
  //   const resp = JSON.parse(data.toRawString());
  //
  //   return trackFromResponse(resp.item);
  // }

  async trackLiked(track: SpotifyApi.TrackObjectFull) {
    // https://developer.spotify.com/documentation/web-api/reference/check-library-contains
    const req = new Request(`https://api.spotify.com/v1/me/library/contains?ids=${track.id}`);

    req.method = 'get';

    req.headers = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
    };

    const resp: SpotifyApi.CheckUsersSavedTracksResponse = await req.loadJSON();

    return resp[0];
  }

  async likeTrack(track: SpotifyApi.TrackObjectFull) {
    // https://developer.spotify.com/documentation/web-api/reference/save-library-items
    if (await this.trackLiked(track)) {
      return;
    }

    const req = new Request('https://api.spotify.com/v1/me/library');

    req.method = 'put';

    req.headers = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    req.body = JSON.stringify({ ids: [track.id] });

    await req.load();

    // if (req.response.statusCode !== 200) {
    //   throw new Error("cannot like track");
    // }
  }

  async getPlaylist(name: string) {
    // https://developer.spotify.com/documentation/web-api/reference/#/operations/get-playlist
    const req = new Request('https://api.spotify.com/v1/me/playlists');

    req.method = 'get';

    req.headers = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
    };

    const resp: SpotifyApi.ListOfCurrentUsersPlaylistsResponse = await req.loadJSON();

    const playlist = resp.items.find((p) => p.name === name);

    if (!playlist) {
      return undefined;
    }

    return playlist.id;
  }

  async createPlaylist(name: string) {
    // https://developer.spotify.com/documentation/web-api/reference/#/operations/create-playlist
    const req = new Request('https://api.spotify.com/v1/me/playlists');

    req.method = 'post';

    req.headers = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    req.body = JSON.stringify({
      name,
      public: true,
      collaborative: false,
    });

    const data = await req.load();

    if (req.response.statusCode !== 201) {
      throw new Error('cannot create playlist');
    }

    const resp: SpotifyApi.CreatePlaylistResponse = JSON.parse(data.toRawString());

    return resp.id;
  }

  async deletePlaylist(_playlist: Playlist) {
    // TODO: this isn't documented???
  }

  async getPlaylistTracks(playlist: Playlist) {
    // https://developer.spotify.com/documentation/web-api/reference/#/operations/get-playlists-items
    const req = new Request(`https://api.spotify.com/v1/playlists/${playlist}/items?limit=50`);

    req.method = 'get';

    req.headers = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
    };

    const resp: SpotifyApi.PlaylistTrackResponse = await req.loadJSON();

    return resp.items.filter((item) => item.track !== null).map((item) => item.track!);
  }

  async trackAlreadyAdded(track: SpotifyApi.TrackObjectFull, playlist: Playlist) {
    const playlistTracks = await this.getPlaylistTracks(playlist);

    return playlistTracks.some((t) => t.id === track.id);
  }

  async addToPlaylist(tracks: SpotifyApi.TrackObjectFull[], playlist: Playlist) {
    // https://developer.spotify.com/documentation/web-api/reference/add-items-to-playlist
    if (tracks.length === 1 && (await this.trackAlreadyAdded(tracks[0], playlist))) {
      throw new Error('track already in playlist');
    }

    const req = new Request(`https://api.spotify.com/v1/playlists/${playlist}/items`);

    req.method = 'post';

    req.headers = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    req.body = JSON.stringify({ uris: tracks.map((track) => track.uri) });

    await req.load();
  }

  async mergePlaylists(playlistFrom: Playlist, playlistTo: Playlist) {
    // TODO
    const tracksFrom = await this.getPlaylistTracks(playlistFrom);
    const tracksTo = await this.getPlaylistTracks(playlistTo);

    const toAdd = tracksFrom.filter((track) => tracksTo.every((t) => t.id !== track.id));

    if (toAdd.length > 0) {
      await this.addToPlaylist(toAdd, playlistTo);
    }
  }
}
