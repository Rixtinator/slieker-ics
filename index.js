import { Browser } from "happy-dom";
import ical from "ical-generator";
import fs from "node:fs";

const months = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
].reduce((acc, month, index) => ({ ...acc, [month]: index }), {});

function parseDate(day, time) {
  const [dow, dom, mon] = day.split(" ");
  const [h, m] = time.split(":");
  const today = new Date();
  const date = parseInt(dom);
  const monthIdx = months[mon];
  const year = today.getFullYear() + ((monthIdx < today.getMonth() || (monthIdx === today.getMonth() && date < today.getDate())) ? 1 : 0);
  const hour = parseInt(h);
  const minute = parseInt(m);
  // console.log({ today, day, time, date, monthIdx, year, hour, minute });
  return new Date(
      year,
      monthIdx,
      date,
      hour,
      minute
  );
}

async function getRuntime(url, browser) {
  const moviePage = browser.newPage();
  await moviePage.goto(url);
  await moviePage.waitUntilComplete();

  const runtimeElement = moviePage.mainFrame.document.querySelector(".movie__length").textContent.trim();
  const runtime = runtimeElement.split(" – ").at(1).match(/^(\d+)\s*min.$/)[1];
  return runtime;
}

async function scrape(page, browser, callback) {
   const movieElements = page.querySelectorAll(".card--film");

   await Promise.all(Array.from(movieElements).map(async (element) => {
     const title = element.querySelector(".card__heading").textContent.trim();

     const dayAndTime = (element.querySelector(".card__prose").textContent.trim()).split(" • ");
     const day = dayAndTime.at(0);
     const time = dayAndTime.at(1);
     if (!time) return;
     const start = parseDate(day, time);

     const url = element.querySelector(".card__overlay").href;

     const runtime = await getRuntime(url, browser);
     const end = new Date(start.getTime() + (parseInt(runtime) || 0) * 60_000);

     let sold_out = false;
     const status = element.querySelector(".card__status");
     if (status && status.textContent.trim().match("Uitverkocht")) {
         sold_out = true;
     }

     callback({ title, start, end, url, sold_out });
   }))
}

async function main() {
  const calendar = ical({
    name: "Slieker"
  });
  const browser = new Browser({
    settings: {
      disableJavaScriptEvaluation: true,
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
      disableComputedStyleRendering: true,
      navigation: {
        disableChildPageNavigation: true,
        disableChildFrameNavigation: true,
      }
    }
  });

  const page = browser.newPage();
  await page.goto("https://sliekerfilm.nl/programma/");
  await page.waitUntilComplete();

  await scrape(page.mainFrame.document, browser,({ title, start, end, url, sold_out }) => {
    calendar.createEvent({
      start,
      end,
      url,
      summary: title,
    })
    console.log(title, start, end, url)
  });

  const dest = process.argv[2] || "out.ics";
  fs.writeFile(dest, calendar.toString(), error => {
    if (error) {
      console.error(error);
    } else {
      console.log(`wrote ${calendar.events().length} events to ${dest}`);
    }
  })

  await browser.close();
}

main();
