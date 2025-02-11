import * as config from './config';
import { Spotify } from './spotify';

function output(msg: string, error?: boolean) {
  if (error) {
    console.error(msg);
  } else {
    console.log(msg);
  }
  Script.setShortcutOutput(msg);
}

(async () => {
  const spotify = new Spotify(config.CLIENT_ID, config.CLIENT_SECRET, config.REFRESH_TOKEN);

  await spotify.updateToken();

  try {
    const currentTrack = await spotify.getCurrentTrack();

    if (!currentTrack) {
      return output('no track playing');
    }

    await spotify.likeTrack(currentTrack);

    const date = new Date();

    const months = [
      'january',
      'february',
      'march',
      'april',
      'may',
      'june',
      'july',
      'august',
      'september',
      'october',
      'november',
      'december',
    ];

    let yearPlaylist = await spotify.getPlaylist(date.getFullYear().toString());

    if (!yearPlaylist) {
      yearPlaylist = await spotify.createPlaylist(date.getFullYear().toString());

      // new year, go back and delete all of last year's months
      for (const month of months) {
        const playlist = await spotify.getPlaylist(month);

        if (playlist) {
          await spotify.deletePlaylist(playlist);
        }
      }
    }

    let monthPlaylist = await spotify.getPlaylist(months[date.getMonth()]);

    if (!monthPlaylist) {
      monthPlaylist = await spotify.createPlaylist(months[date.getMonth()]);
    }

    if (await spotify.trackAlreadyAdded(currentTrack, monthPlaylist)) {
      return output(
        `${currentTrack.name} by ${currentTrack.artists[0].name} is already in your playlist`,
      );
    }

    await spotify.addToPlaylist([currentTrack], monthPlaylist);

    if (!(await spotify.trackAlreadyAdded(currentTrack, yearPlaylist))) {
      await spotify.addToPlaylist([currentTrack], yearPlaylist);
    }

    output(`added ${currentTrack.name} by ${currentTrack.artists[0].name} to your playlist`);
  } catch (e: any) {
    return output(e, true);
  }
})().then(() => {
  Script.complete();
});
