const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
const app = express();

app.use(express.json());

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(-1);
  }
};

initializeDBAndServer();

const convertStateObj = (dbObj) => {
  return {
    stateId: dbObj.state_id,
    stateName: dbObj.state_name,
    population: dbObj.population,
  };
};

const convertDistrictObj = (dbObj) => {
  return {
    districtId: dbObj.district_id,
    districtName: dbObj.district_name,
    stateId: dbObj.state_id,
    cases: dbObj.cases,
    cured: dbObj.cured,
    active: dbObj.active,
    deaths: dbObj.deaths,
  };
};

//User Login API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    //If an unregistered user tries to login
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      //Successful login of the user
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      //If the user provides an incorrect password
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Authentication with Token
const authenticator = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
    if (jwtToken === undefined) {
      response.status(401);
      response.send("Invalid JWT Token");
    } else {
      jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.username = payload.username;
          next();
        }
      });
    }
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

//Get States API
app.get("/states/", authenticator, async (request, response) => {
  const getStatesQuery = `
    SELECT
      *
    FROM
      state;`;
  const statesArray = await db.all(getStatesQuery);
  response.send(
    statesArray.map((eachDirector) => convertStateObj(eachDirector))
  );
});

//Get State API
app.get("/states/:stateId/", authenticator, async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = `
      SELECT * FROM state
      WHERE state_id = ${stateId};
    `;
  const state = await db.get(getStateQuery);
  response.send(convertStateObj(state));
});

//Create District API
app.post("/districts/", authenticator, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const createDistrictQuery = `
      INSERT INTO
        district (district_name, state_id, cases, cured, active, deaths )
      VALUES
        (
          '${districtName}',
          ${stateId},
          ${cases},
          ${cured},
          ${active},
          ${deaths}
        )`;
  await db.run(createDistrictQuery);
  response.send(`District Successfully Added`);
});

//Get District API
app.get("/districts/:districtId/", authenticator, async (request, response) => {
  const { districtId } = request.params;
  const getDistrictQuery = `
      SELECT * FROM district
      WHERE district_id = ${districtId};
    `;
  const district = await db.get(getDistrictQuery);
  response.send(convertDistrictObj(district));
});

//Delete District API
app.delete(
  "/districts/:districtId/",
  authenticator,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `
  DELETE FROM
    district
  WHERE
    district_id = '${districtId}';`;
    await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

// API-6 - Updates the details of a specific district based on the district ID
app.put("/districts/:districtId/", authenticator, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const { districtId } = request.params;
  const updateDistrictQuery = `
    UPDATE
        district
    SET
        district_name = '${districtName}',
        state_id = '${stateId}',
        cases = '${cases}',
        cured = '${cured}',
        active = '${active}',
        deaths = '${deaths}'
    WHERE
        district_id = '${districtId}';`;
  await db.run(updateDistrictQuery);
  response.send("District Details Updated");
});

// API-7 - Returns the statistics of total cases, cured, active, deaths of a specific state based on state ID
app.get("/states/:stateId/stats/", authenticator, async (request, response) => {
  const { stateId } = request.params;
  const getStatsQuery = `
    SELECT
      SUM(cases),SUM(cured),SUM(active),SUM(deaths)
    FROM
      district
    WHERE
      state_id='${stateId}';`;
  const stats = await db.get(getStatsQuery);
  response.send({
    totalCases: stats["SUM(cases)"],
    totalCured: stats["SUM(cured)"],
    totalActive: stats["SUM(active)"],
    totalDeaths: stats["SUM(deaths)"],
  });
});

module.exports = app;
