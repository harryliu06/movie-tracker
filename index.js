import axios from "axios";
import bodyParser from "body-parser";
import express from "express";
import pg from "pg";
import "dotenv/config";

const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "movie_tracker",
  password: `${process.env.PG_KEY}`,
  port: 5432,
});

const SERIES_API_URL =
  "https://api.themoviedb.org/3/account/21305552/favorite/tv?language=en-US&page=1&sort_by=created_at.asc";

const MOVIE_API_URL =
  "https://api.themoviedb.org/3/account/21305552/favorite/movies?language=en-US&page=1&sort_by=created_at.asc";

const options = {
  method: "GET",
  headers: {
    accept: "application/json",
    Authorization: `Bearer ${process.env.API_KEY}`,
  },
};

db.connect();

const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

const getOrderByClause = (sort_choice, table) => {
  switch (sort_choice) {
    case "title":
      return table === "series" ? "ORDER BY name ASC" : "ORDER BY title ASC";
    case "date":
      return table === "series"
        ? "ORDER BY first_air_date DESC"
        : "ORDER BY release_date DESC";
    case "rating":
      return "ORDER BY vote_average DESC";
    default:
      return "ORDER BY vote_average DESC";
  }
};

app.get("/", async (req, res) => {
  try {
    const [series_response, movie_response] = await Promise.all([
      axios.get(SERIES_API_URL, options),
      axios.get(MOVIE_API_URL, options),
    ]);

    const series_result = series_response.data.results;
    const movie_result = movie_response.data.results;

    const sort_choice = req.query.sort || "default";

    await db.query("DELETE FROM series");
    await db.query("DELETE FROM movies");

    series_result.forEach(async (serie) => {
      await db.query(
        "INSERT INTO series (name, overview, poster_path, vote_average, first_air_date, series_id, genre) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [
          serie.name,
          serie.overview,
          serie.poster_path,
          serie.vote_average,
          serie.first_air_date,
          serie.id,
          serie.genre_ids,
        ]
      );
    });

    movie_result.forEach(async (movie) => {
      await db.query(
        "INSERT INTO movies (title, overview, poster_path, vote_average, release_date, movie_id, genre) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [
          movie.title,
          movie.overview,
          movie.poster_path,
          movie.vote_average,
          movie.release_date,
          movie.id,
          movie.genre_ids,
        ]
      );
    });

    const series_order_clause = getOrderByClause(sort_choice, "series");
    const movies_order_clause = getOrderByClause(sort_choice, "movies");

    const { rows: series } = await db.query(
      `SELECT * FROM series ${series_order_clause}`
    );
    const { rows: movies } = await db.query(
      `SELECT * FROM movies ${movies_order_clause}`
    );

    res.render("index.ejs", { series, movies });
  } catch (error) {
    console.error("Failed to make request:", error.message);
    res.render("index.ejs", {
      error: error.message,
      series: [],
      movies: [],
    });
  }
});

app.get("/series/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: series } = await db.query(
      "SELECT * FROM series WHERE series_id = $1",
      [id]
    );

    if (series.length === 0) {
      res.status(404).send("Series not found");
      return;
    }

    let genres = await Promise.all(
      series[0].genre.map(async (gid) => {
        let result = await db.query(
          "SELECT genre FROM genres WHERE type_id = $1",
          [gid]
        );
        return result.rows[0].genre;
      })
    );

    console.log("Genres:", genres);

    res.render("series_details.ejs", { series: series[0], genres: genres });
  } catch (error) {
    console.error("Error fetching series details:", error.message);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/movies/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: movie } = await db.query(
      "SELECT * FROM movies WHERE movie_id = $1",
      [id]
    );

    if (movie.length === 0) {
      res.status(404).send("Movie not found");
      return;
    }

    let genres = await Promise.all(
      movie[0].genre.map(async (gid) => {
        let result = await db.query(
          "SELECT genre FROM genres WHERE type_id = $1",
          [gid]
        );
        return result.rows[0].genre;
      })
    );

    console.log("Genres:", genres);

    res.render("movie_details.ejs", { movie: movie[0], genres: genres });
  } catch (error) {
    console.error("Error fetching movie details: ", error.message);
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
