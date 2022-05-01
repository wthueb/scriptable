class Track {
  name: string = "";
  artist: string = "";
  uri: string = "";
  id: string = "";
}

export class Spotify {
  clientId: string;
  clientSecret: string;
  refreshToken: string;

  accessToken: string = "";

  constructor(clientId: string, clientSecret: string, refreshToken: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.refreshToken = refreshToken;
  }

  async updateToken(): Promise<void> {
    const req = new Request("https://accounts.spotify.com/api/token");

    req.method = "post";

    req.headers = {
      Authorization: `Basic ${btoa(this.clientId + ":" + this.clientSecret)}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    };

    req.body = `grant_type=refresh_token&refresh_token=${this.refreshToken}`;

    const resp = await req.loadJSON();

    this.accessToken = resp.access_token;
  }

  async getCurrentTrack(): Promise<Track> {
    const req = new Request("https://api.spotify.com/v1/me/player");

    req.method = "get";

    req.headers = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: "application/json",
    };

    const data = await req.load();

    if (req.response.statusCode === 204) {
      throw new Error("no track playing");
    }

    const resp = JSON.parse(data.toRawString());

    // in seconds
    const secondsSincePlaying = (Date.now() - resp.timestamp) / 1000;

    if (!resp.is_playing && secondsSincePlaying > 10) {
      throw new Error("no track playing");
    }

    const track = new Track();

    track.name = resp.item.name;
    track.artist = resp.item.artists[0].name;
    track.uri = resp.item.uri;
    track.id = resp.item.id;

    return track;
  }

  async getPlaylistId(): Promise<string> {
    const req = new Request("https://api.spotify.com/v1/me/playlists?limit=50");

    req.method = "get";

    req.headers = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: "application/json",
    };

    const resp = await req.loadJSON();

    const month = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ][new Date().getMonth()];

    const playlist = resp.items.find((p: { name: string }) => p.name === month);

    if (!playlist) {
      throw new Error("cannot find playlist");
    }

    return playlist.id;
  }

  async trackAlreadyLiked(track: Track): Promise<boolean> {
    const req = new Request(
      `https://api.spotify.com/v1/me/tracks/contains?ids=${track.id}`
    );

    req.method = "get";

    req.headers = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: "application/json",
    };

    const resp = await req.loadJSON();

    return resp[0];
  }

  async trackAlreadyAdded(track: Track, playlistId: string): Promise<boolean> {
    const req = new Request(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50`
    );

    req.method = "get";

    req.headers = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: "application/json",
    };

    const resp = await req.loadJSON();

    return resp.items.some(
      (item: { track: { uri: string } }) => item.track.uri === track.uri
    );
  }

  async createPlaylist(): Promise<string> {
    const req = new Request("https://api.spotify.com/v1/me/playlists");

    req.method = "post";

    req.headers = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    const month = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ][new Date().getMonth()];

    req.body = JSON.stringify({
      name: month,
      public: true,
      collaborative: false,
    });

    const data = await req.load();

    if (req.response.statusCode !== 201) {
      throw new Error("cannot create playlist");
    }

    const resp = JSON.parse(data.toRawString());

    return resp.id;
  }

  async likeTrack(track: Track): Promise<void> {
    if (await this.trackAlreadyLiked(track)) {
      return;
    }

    const req = new Request("https://api.spotify.com/v1/me/tracks");

    req.method = "put";

    req.headers = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    req.body = JSON.stringify({ ids: [track.id] });

    await req.load();

    // if (req.response.statusCode !== 200) {
    //   throw new Error("cannot like track");
    // }
  }

  async addToPlaylist(track: Track, playlistId: string): Promise<void> {
    if (await this.trackAlreadyAdded(track, playlistId)) {
      throw new Error("track already in playlist");
    }

    const req = new Request(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks`
    );

    req.method = "post";

    req.headers = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    req.body = JSON.stringify({ uris: [track.uri] });

    await req.load();
  }
}
