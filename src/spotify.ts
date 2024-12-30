type Playlist = string;

class Track {
  name = '';
  artist = '';
  uri = '';
  id = '';
}

interface TrackResponse {
  name: string;
  artists: [{ name: string }];
  uri: string;
  id: string;
}

function trackFromResponse(response: TrackResponse): Track {
  const track = new Track();

  track.name = response.name;
  track.artist = response.artists[0].name;
  track.uri = response.uri;
  track.id = response.id;

  return track;
}

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

  async updateToken(): Promise<void> {
    const req = new Request('https://accounts.spotify.com/api/token');

    req.method = 'post';

    req.headers = {
      Authorization: `Basic ${btoa(this.clientId + ':' + this.clientSecret)}`,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    req.body = `grant_type=refresh_token&refresh_token=${this.refreshToken}`;

    const resp = await req.loadJSON();

    this.accessToken = resp.access_token;
  }

  async getCurrentTrack(): Promise<Track | undefined> {
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

    const resp = JSON.parse(data.toRawString());

    // in seconds
    const secondsSincePlaying = (Date.now() - resp.timestamp) / 1000;

    if (!resp.is_playing && secondsSincePlaying > 30) {
      return undefined;
    }

    return trackFromResponse(resp.item);
  }

  /*   async getCurrentTrack(): Promise<Track> {
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

  async trackLiked(track: Track): Promise<boolean> {
    // https://developer.spotify.com/documentation/web-api/reference/#/operations/check-users-saved-tracks
    const req = new Request(`https://api.spotify.com/v1/me/tracks/contains?ids=${track.id}`);

    req.method = 'get';

    req.headers = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
    };

    const resp = await req.loadJSON();

    return resp[0];
  }

  async likeTrack(track: Track): Promise<void> {
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

  async getPlaylist(name: string): Promise<Playlist | undefined> {
    // https://developer.spotify.com/documentation/web-api/reference/#/operations/get-playlist
    const req = new Request('https://api.spotify.com/v1/me/playlists');

    req.method = 'get';

    req.headers = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
    };

    const resp = await req.loadJSON();

    const playlist = resp.items.find((p: { name: string }) => p.name === name);

    if (!playlist) {
      return undefined;
    }

    return playlist.id;
  }

  async createPlaylist(name: string): Promise<Playlist> {
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

    const resp = JSON.parse(data.toRawString());

    return resp.id;
  }

  async deletePlaylist(_playlist: Playlist): Promise<void> {
    // TODO: this isn't documented???
  }

  async getPlaylistTracks(playlist: Playlist): Promise<Track[]> {
    // https://developer.spotify.com/documentation/web-api/reference/#/operations/get-playlists-tracks
    const req = new Request(`https://api.spotify.com/v1/playlists/${playlist}/tracks?limit=50`);

    req.method = 'get';

    req.headers = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
    };

    const resp = await req.loadJSON();

    return resp.items.map((item: { track: TrackResponse }) => trackFromResponse(item.track));
  }

  async trackAlreadyAdded(track: Track, playlist: Playlist): Promise<boolean> {
    const playlistTracks = await this.getPlaylistTracks(playlist);

    return playlistTracks.some((t: Track) => t.id === track.id);
  }

  async addToPlaylist(tracks: Track[], playlist: Playlist): Promise<void> {
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

  async mergePlaylists(playlistFrom: Playlist, playlistTo: Playlist): Promise<void> {
    // TODO
    const tracksFrom = await this.getPlaylistTracks(playlistFrom);
    const tracksTo = await this.getPlaylistTracks(playlistTo);

    const toAdd = tracksFrom.filter((track) => tracksTo.every((t) => t.id !== track.id));

    if (toAdd.length > 0) {
      await this.addToPlaylist(toAdd, playlistTo);
    }
  }
}
