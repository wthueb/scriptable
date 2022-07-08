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

    if (!currentTrack) {
      return output("no track playing");
    }

    await spot.likeTrack(currentTrack);

    const date = new Date();

    const months = [
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
    ];

    let playlistId = await spot.getPlaylist(months[date.getMonth()]);

    if (!playlistId) {
      playlistId = await spot.createPlaylist(months[date.getMonth()]);

      const year = date.getFullYear();

      let yearPlaylist;

      if (date.getMonth() === 0) {
        // if it's january now, we need to move the tracks from december to the previous year
        yearPlaylist = await spot.getPlaylist((year - 1).toString());

        if (!yearPlaylist) {
          yearPlaylist = await spot.createPlaylist((year - 1).toString());
        }
      } else {
        // we need to move the tracks from the previous month to the current year
        yearPlaylist = await spot.getPlaylist(year.toString());

        if (!yearPlaylist) {
          yearPlaylist = await spot.createPlaylist(year.toString());
        }
      }

      await spot.mergePlaylists(yearPlaylist, playlistId);

      await spot.deletePlaylist(yearPlaylist);
    }

    if (await spot.trackAlreadyAdded(currentTrack, playlistId)) {
      return output(
        `${currentTrack.name} by ${currentTrack.artist} is already in your playlist`
      );
    }

    await spot.addToPlaylist([currentTrack], playlistId);

    output(
      `added ${currentTrack.name} by ${currentTrack.artist} to your playlist`
    );
  } catch (e: any) {
    return output(e, true);
  }
})().then(() => {
  Script.complete();
});
