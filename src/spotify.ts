type Playlist = string;

export class Spotify {
  clientId: string;
  clientSecret: string;
  refreshToken: string;

  accessToken = '';

  constructor(clientId: string, clientSecret: string, refreshToken: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.refreshToken = refreshToken;
  }

  async updateToken() {
    const req = new Request('https://accounts.spotify.com/api/token');

    req.method = 'post';

    req.headers = {
      Authorization: `Basic ${btoa(this.clientId + ':' + this.clientSecret)}`,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    req.body = `grant_type=refresh_token&refresh_token=${this.refreshToken}`;

    const resp: { access_token: string } = await req.loadJSON();

    this.accessToken = resp.access_token;
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

    // in seconds
    const secondsSincePlaying = (Date.now() - resp.timestamp) / 1000;

    if (
      (!resp.is_playing && secondsSincePlaying > 30) ||
      resp.item === null ||
      !('artists' in resp.item)
    ) {
      return undefined;
    }

    return resp.item;
  }

  /*   async getCurrentTrack() {
    // https://developer.spotify.com/documentation/web-api/reference/#/operations/get-the-users-currently-playing-track
    const req = new Request(
      "https://api.spotify.com/v1/me/player/currently-playing"
    );

    req.method = "get";

    req.headers = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: "application/json",
    };

    const data = await req.load();

    if (req.response.statusCode !== 200) {
      throw new Error("no track playing");
    }

    const resp = JSON.parse(data.toRawString());

    return trackFromResponse(resp.item);
  } */

  async trackLiked(track: SpotifyApi.TrackObjectFull) {
    // https://developer.spotify.com/documentation/web-api/reference/#/operations/check-users-saved-tracks
    const req = new Request(`https://api.spotify.com/v1/me/tracks/contains?ids=${track.id}`);

    req.method = 'get';

    req.headers = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
    };

    const resp: SpotifyApi.CheckUsersSavedTracksResponse = await req.loadJSON();

    return resp[0];
  }

  async likeTrack(track: SpotifyApi.TrackObjectFull) {
    // https://developer.spotify.com/documentation/web-api/reference/#/operations/save-tracks-user
    if (await this.trackLiked(track)) {
      return;
    }

    const req = new Request('https://api.spotify.com/v1/me/tracks');

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
    // https://developer.spotify.com/documentation/web-api/reference/#/operations/get-playlists-tracks
    const req = new Request(`https://api.spotify.com/v1/playlists/${playlist}/tracks?limit=50`);

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
    // https://developer.spotify.com/documentation/web-api/reference/#/operations/add-tracks-to-playlist
    if (tracks.length === 1 && (await this.trackAlreadyAdded(tracks[0], playlist))) {
      throw new Error('track already in playlist');
    }

    const req = new Request(`https://api.spotify.com/v1/playlists/${playlist}/tracks`);

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
