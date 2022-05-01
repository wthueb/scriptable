import * as config from "./config";
import { Spotify } from "./spotify";

function output(msg: string, error?: boolean) {
  if (error) {
    console.error(msg);
  } else {
    console.log(msg);
  }
  Script.setShortcutOutput(msg);
}

(async () => {
  const spot = new Spotify(
    config.CLIENT_ID,
    config.CLIENT_SECRET,
    config.REFRESH_TOKEN
  );

  await spot.updateToken();

  try {
    const currentTrack = await spot.getCurrentTrack();

    await spot.likeTrack(currentTrack);

    let playlistId;

    try {
      playlistId = await spot.getPlaylistId();
    } catch (e) {
      playlistId = await spot.createPlaylist();
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
  } catch (e) {
    return output("there isn't a track playing");
  }
})().then(() => {
  Script.complete();
});
