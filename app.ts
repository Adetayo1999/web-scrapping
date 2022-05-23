import express, { Request, Response } from "express";
import cors from "cors";
import logger from "morgan";
import { load } from "cheerio";
import { createClient } from "redis";
import axios from "axios";

(async () => {
  const app = express();
  const PORT = process.env.PORT || 8080;
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(logger("dev"));

  const redisClient = createClient();

  await redisClient.connect();

  app.get("/search", async (request: Request, response: Response) => {
    try {
      const searchQuery = request.query.query;

      if (!searchQuery) {
        response.status(400).json({ message: "Search text cannot be empty" });
        return;
      }

      const cachedResult = await redisClient.get(`query=${searchQuery}`);

      if (cachedResult) {
        return response.json(JSON.parse(cachedResult));
      }

      type ResultType = {
        id: number;
        title: string;
        url: string | undefined;
        image: string | undefined;
        date: string;
      };
      const results: ResultType[] = [];
      const { data } = await axios.get(
        `https://www.news24.com/news24/search?query=${searchQuery}`
      );
      const $ = load(data);
      $("article.article-item").each((index, element) => {
        const title = $(element)
          .find(".article-item__title span")
          .text()
          .trim();
        let url = $(element).find("a.article-item--url").attr("href");
        if (url && url[0] === "/") {
          url = `https://www.news24.com${url}`;
        }
        const image = $(element).find("img").attr("data-src");
        const date = $(element).find(".article-item__date").text();
        const data = {
          id: index + 1,
          title,
          url,
          image,
          date,
        };
        results.push(data);
      });

      const clientResponse = {
        code: 200,
        message: `search results for ${searchQuery}`,
        results,
      };
      await redisClient.setEx(
        `query=${searchQuery}`,
        3600,
        JSON.stringify(clientResponse)
      );
      response.json(clientResponse);
    } catch (error: any) {
      response.status(500).json({ message: error.message });
    }
  });

  app.use("*", (_, response: Response) => {
    response.status(404).json({ message: "Invalid Route" });
  });

  app.listen(PORT, () => console.log(`[server]: listening on port ${PORT} 🚀`));
})();
