import { Spotify } from "./spotify";

import * as config from "./config";

function output(msg: string, error?: boolean) {
  if (error) {
    console.error(msg);
  } else {
    console.log(msg);
  }
  Script.setShortcutOutput(msg);
}

(async () => {
  try {
    const spot = new Spotify(config.CLIENT_ID, config.CLIENT_SECRET, config.REFRESH_TOKEN);

    await spot.updateToken();

    const currentTrack = await spot.getTrack();

    if (!currentTrack) {
      return output("there isn't a track playing");
    }

    await spot.likeTrack(currentTrack);

    const playlistId = await spot.getPlaylistId();

    if (!playlistId) {
      return output("you need to make the playlist");
    }

    if (await spot.trackAlreadyAdded(currentTrack, playlistId)) {
      return output(
        `${currentTrack.name} by ${currentTrack.artist} is already in your playlist`
      );
    }

    await spot.addToPlaylist(currentTrack, playlistId);

    output(
      `added ${currentTrack.name} by ${currentTrack.artist} to your playlist`
    );
  } catch (err) {
    output(`there was an error: ${err}`, true);
  }
})().then(() => {
  Script.complete();
});
