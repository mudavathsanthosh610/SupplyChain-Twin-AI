from __future__ import annotations



from io import BytesIO

import json

import re

from urllib.parse import urlencode, quote

from urllib.request import Request as UrlRequest, urlopen

from urllib.error import URLError, HTTPError



from fastapi import APIRouter, Depends, HTTPException, Request

from pydantic import BaseModel

from sqlalchemy.orm import Session



from app.db.session import get_db

from app.db_models.entities import (

    Company,

    SupplyNode,

    SupplyRoute,

)





router = APIRouter(

    prefix="/public-directory",

    tags=["Public Company Directory"],

)





FALLBACK_COUNTRIES = [

    "Argentina",

    "Australia",

    "Austria",

    "Bangladesh",

    "Belgium",

    "Brazil",

    "Canada",

    "Chile",

    "China",

    "Colombia",

    "Czechia",

    "Denmark",

    "Egypt",

    "Finland",

    "France",

    "Germany",

    "Greece",

    "Hong Kong",

    "Hungary",

    "India",

    "Indonesia",

    "Ireland",

    "Israel",

    "Italy",

    "Japan",

    "Malaysia",

    "Mexico",

    "Netherlands",

    "New Zealand",

    "Nigeria",

    "Norway",

    "Pakistan",

    "Philippines",

    "Poland",

    "Portugal",

    "Qatar",

    "Romania",

    "Saudi Arabia",

    "Singapore",

    "South Africa",

    "South Korea",

    "Spain",

    "Sweden",

    "Switzerland",

    "Taiwan",

    "Thailand",

    "Turkey",

    "United Arab Emirates",

    "United Kingdom",

    "United States",

    "Vietnam",

]





COMPANY_DESCRIPTION_KEYWORDS = (

    "company",

    "corporation",

    "business",

    "manufacturer",

    "manufacturing",

    "enterprise",

    "group",

    "conglomerate",

    "bank",

    "airline",

    "automotive",

    "pharmaceutical",

    "technology",

    "logistics",

    "retail",

    "energy",

    "telecommunications",

    "industrial",

)





class PublicCompanyImport(BaseModel):

    external_id: str

    name: str

    description: str | None = None

    source_url: str | None = None

    country: str





def _fetch_json(url: str) -> dict | list:

    request = UrlRequest(

        url,

        headers={

            "User-Agent": (

                "SupplyChainTwinAI/0.6 "

                "(local educational digital twin)"

            )

        },

    )



    with urlopen(

        request,

        timeout=15,

    ) as response:

        return json.loads(

            response.read().decode(

                "utf-8"

            )

        )





@router.get("/countries")

def list_countries():

    try:

        data = _fetch_json(

            "https://restcountries.com/v3.1/all?fields=name"

        )



        countries = sorted(

            {

                item.get(

                    "name",

                    {},

                ).get(

                    "common"

                )

                for item in data

                if item.get(

                    "name",

                    {},

                ).get(

                    "common"

                )

            }

        )



        if countries:

            return {

                "countries": countries,

                "source": "REST Countries",

            }

    except Exception:

        pass



    return {

        "countries":

            FALLBACK_COUNTRIES,

        "source":

            "built-in fallback",

    }





@router.get("/companies")
def search_companies(
    country: str,
    q: str,
):
    query = q.strip()
    country_name = country.strip()

    if not query:
        raise HTTPException(
            status_code=400,
            detail="Enter a company name to search.",
        )

    # Search both by company name alone and by company name + country.
    # This avoids missing valid company matches when the external directory
    # does not index the country term in the same way.
    search_terms = [
        query,
        f"{query} {country_name}",
    ]

    merged_results = {}

    try:
        for search_text in search_terms:
            params = urlencode(
                {
                    "action": "wbsearchentities",
                    "search": search_text,
                    "language": "en",
                    "format": "json",
                    "limit": 40,
                    "type": "item",
                }
            )

            url = (
                "https://www.wikidata.org/"
                f"w/api.php?{params}"
            )

            data = _fetch_json(url)

            for item in data.get("search", []):
                entity_id = item.get("id")

                if not entity_id:
                    continue

                label = (
                    item.get("label")
                    or ""
                ).strip()

                description = (
                    item.get("description")
                    or ""
                ).strip()

                if not label:
                    continue

                label_lower = label.lower()
                description_lower = description.lower()
                query_lower = query.lower()

                name_match = (
                    query_lower in label_lower
                )

                company_like = any(
                    keyword in description_lower
                    for keyword in (
                        "company",
                        "corporation",
                        "business",
                        "manufacturer",
                        "manufacturing",
                        "conglomerate",
                        "enterprise",
                        "group",
                        "bank",
                        "automotive",
                        "technology",
                        "pharmaceutical",
                        "logistics",
                        "retail",
                        "energy",
                        "industrial",
                        "telecommunications",
                        "airline",
                    )
                )

                if not (
                    name_match
                    or company_like
                ):
                    continue

                merged_results[
                    entity_id
                ] = {
                    "external_id":
                        entity_id,
                    "name":
                        label,
                    "description":
                        description or None,
                    "source_url":
                        (
                            "https://www.wikidata.org/"
                            f"wiki/{entity_id}"
                        ),
                    "country":
                        country_name,
                }

        results = list(
            merged_results.values()
        )[:20]

        return {
            "country":
                country_name,
            "query":
                query,
            "results":
                results,
            "source":
                "Wikidata",
            "note": (
                "Country is used as search context. "
                "Public directory results are not an "
                "exhaustive official company register."
            ),
        }

    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail=(
                "Public company search "
                f"is currently unavailable: {error}"
            ),
        )


@router.post("/import-company")

def import_company(

    payload: PublicCompanyImport,

    db: Session = Depends(

        get_db

    ),

):

    existing = (

        db.query(Company)

        .filter(

            Company.name

            == payload.name

        )

        .first()

    )



    if existing is not None:

        return {

            "created": False,

            "company": {

                "id":

                    existing.id,

                "name":

                    existing.name,

                "description":

                    existing.description,

                "is_demo":

                    existing.is_demo,

            },

        }



    description_lines = [

        f"Country: {payload.country}",

        (

            "Public directory ID: "

            f"{payload.external_id}"

        ),

    ]



    if payload.source_url:

        description_lines.append(

            "Public source: "

            f"{payload.source_url}"

        )



    if payload.description:

        description_lines.append(

            "Public description: "

            f"{payload.description}"

        )



    company = Company(

        name=payload.name,

        description="\n".join(

            description_lines

        ),

        is_demo=False,

    )



    db.add(company)

    db.commit()

    db.refresh(company)



    return {

        "created": True,

        "company": {

            "id": company.id,

            "name": company.name,

            "description":

                company.description,

            "is_demo":

                company.is_demo,

        },

    }





def _extract_public_id(

    description: str | None,

) -> str | None:

    if not description:

        return None



    match = re.search(

        r"Public directory ID:\s*(Q\d+)",

        description,

    )



    return (

        match.group(1)

        if match

        else None

    )





def _claim_value(

    claims: dict,

    property_id: str,

):

    values = []



    for claim in claims.get(

        property_id,

        [],

    ):

        mainsnak = claim.get(

            "mainsnak",

            {},

        )



        datavalue = mainsnak.get(

            "datavalue",

            {},

        )



        value = datavalue.get(

            "value"

        )



        if value is not None:

            values.append(value)



    return values





def _resolve_entity_labels(

    ids: list[str],

) -> dict[str, str]:

    clean = [

        item

        for item in ids

        if isinstance(

            item,

            str,

        )

        and item.startswith("Q")

    ]



    if not clean:

        return {}



    params = urlencode(

        {

            "action":

                "wbgetentities",

            "ids":

                "|".join(

                    clean[:50]

                ),

            "props":

                "labels",

            "languages":

                "en",

            "format":

                "json",

        }

    )



    data = _fetch_json(

        "https://www.wikidata.org/"

        f"w/api.php?{params}"

    )



    labels = {}



    for entity_id, entity in (

        data.get(

            "entities",

            {}

        ).items()

    ):

        label = (

            entity.get(

                "labels",

                {},

            )

            .get(

                "en",

                {},

            )

            .get(

                "value"

            )

        )



        if label:

            labels[

                entity_id

            ] = label



    return labels





@router.post(

    "/import-public-data/{company_id}"

)

def import_public_data(

    company_id: int,

    db: Session = Depends(

        get_db

    ),

):

    company = db.get(

        Company,

        company_id,

    )



    if company is None:

        raise HTTPException(

            status_code=404,

            detail=(

                "Company workspace "

                "not found."

            ),

        )



    entity_id = (

        _extract_public_id(

            company.description

        )

    )



    if not entity_id:

        raise HTTPException(

            status_code=400,

            detail=(

                "This workspace was not "

                "created from a public "

                "directory result. Search "

                "and select the company "

                "first."

            ),

        )



    try:

        entity_data = _fetch_json(

            "https://www.wikidata.org/"

            f"wiki/Special:EntityData/"

            f"{entity_id}.json"

        )

    except Exception as error:

        raise HTTPException(

            status_code=502,

            detail=(

                "Unable to download "

                "public company data: "

                f"{error}"

            ),

        )



    entity = (

        entity_data.get(

            "entities",

            {}

        ).get(

            entity_id,

            {}

        )

    )



    claims = entity.get(

        "claims",

        {}

    )



    websites = _claim_value(

        claims,

        "P856",

    )



    inception_values = _claim_value(

        claims,

        "P571",

    )



    hq_values = _claim_value(

        claims,

        "P159",

    )



    industry_values = _claim_value(

        claims,

        "P452",

    )



    hq_ids = [

        value.get("id")

        for value in hq_values

        if isinstance(

            value,

            dict,

        )

        and value.get("id")

    ]



    industry_ids = [

        value.get("id")

        for value

        in industry_values

        if isinstance(

            value,

            dict,

        )

        and value.get("id")

    ]



    labels = {}



    try:

        labels = (

            _resolve_entity_labels(

                hq_ids

                + industry_ids

            )

        )

    except Exception:

        labels = {}



    public_lines = [

        line

        for line in (

            company.description

            or ""

        ).splitlines()

        if not line.startswith(

            "Imported public "

        )

    ]



    if websites:

        public_lines.append(

            "Imported public website: "

            f"{websites[0]}"

        )



    if hq_ids:

        public_lines.append(

            "Imported public headquarters: "

            + ", ".join(

                labels.get(

                    item,

                    item,

                )

                for item

                in hq_ids

            )

        )



    if industry_ids:

        public_lines.append(

            "Imported public industries: "

            + ", ".join(

                labels.get(

                    item,

                    item,

                )

                for item

                in industry_ids

            )

        )



    if inception_values:

        first = inception_values[0]



        if isinstance(

            first,

            dict,

        ):

            time_value = (

                first.get("time")

            )



            if time_value:

                public_lines.append(

                    "Imported public inception: "

                    f"{time_value}"

                )



    company.description = (

        "\n".join(public_lines)

    )



    db.commit()



    return {

        "status": "ok",

        "company_id":

            company.id,

        "message": (

            "Public company profile data "

            "was downloaded and stored. "

            "Exact suppliers, internal "

            "routes, route costs, inventory, "

            "daily demand and safety stock "

            "are usually private, so those "

            "values were not invented. "

            "Use Excel/manual entry or "

            "Create Demo Network for them."

        ),

        "source":

            f"https://www.wikidata.org/wiki/{entity_id}",

    }





def _company_country(

    company: Company,

) -> str:

    description = (

        company.description

        or ""

    )



    match = re.search(

        r"Country:\s*([^\n]+)",

        description,

    )



    if match:

        return (

            match.group(1)

            .strip()

        )



    return "Unknown"





@router.post(

    "/create-demo-network/{company_id}"

)

def create_demo_network(

    company_id: int,

    db: Session = Depends(

        get_db

    ),

):

    company = db.get(

        Company,

        company_id,

    )



    if company is None:

        raise HTTPException(

            status_code=404,

            detail=(

                "Company workspace "

                "not found."

            ),

        )



    existing_nodes = (

        db.query(SupplyNode)

        .filter(

            SupplyNode.company_id

            == company_id,

            SupplyNode.active.is_(

                True

            ),

        )

        .count()

    )



    if existing_nodes > 0:

        raise HTTPException(

            status_code=409,

            detail=(

                "This company already has "

                "network nodes. Demo generation "

                "was stopped to avoid mixing "

                "synthetic data with existing data."

            ),

        )



    country = _company_country(

        company

    )



    if country.lower() == "india":

        node_specs = [

            (

                "SUP_01",

                "Primary Components Supplier",

                "SUPPLIER",

                "Pune",

                900,

                0,

                0,

                0,

            ),

            (

                "PLANT_01",

                "Main Manufacturing Plant",

                "PLANT",

                "Pune",

                800,

                0,

                0,

                0,

            ),

            (

                "PORT_A",

                "Primary Gateway Port",

                "PORT",

                "Navi Mumbai",

                700,

                0,

                0,

                0,

            ),

            (

                "PORT_B",

                "Alternate Gateway Port",

                "PORT",

                "Chennai",

                600,

                0,

                0,

                0,

            ),

            (

                "DC_01",

                "Regional Distribution Centre",

                "Hyderabad",

                750,

                6000,

                450,

                1500,

            ),

            (

                "WH_01",

                "Regional Warehouse",

                "WAREHOUSE",

                "Vijayawada",

                550,

                3200,

                300,

                900,

            ),

            (

                "CUST_01",

                "Primary Customer Market",

                "CUSTOMER",

                "Vijayawada",

                500,

                1200,

                350,

                500,

            ),

        ]

    else:

        node_specs = [

            (

                "SUP_01",

                "Primary Supplier",

                "SUPPLIER",

                None,

                900,

                0,

                0,

                0,

            ),

            (

                "PLANT_01",

                "Main Plant",

                "PLANT",

                None,

                800,

                0,

                0,

                0,

            ),

            (

                "PORT_A",

                "Primary Gateway",

                "PORT",

                None,

                700,

                0,

                0,

                0,

            ),

            (

                "PORT_B",

                "Alternate Gateway",

                "PORT",

                None,

                600,

                0,

                0,

                0,

            ),

            (

                "DC_01",

                "Distribution Centre",

                "DISTRIBUTION_CENTER",

                None,

                750,

                6000,

                450,

                1500,

            ),

            (

                "WH_01",

                "Regional Warehouse",

                "WAREHOUSE",

                None,

                550,

                3200,

                300,

                900,

            ),

            (

                "CUST_01",

                "Customer Market",

                "CUSTOMER",

                None,

                500,

                1200,

                350,

                500,

            ),

        ]



    nodes = {}



    for (

        code,

        name,

        node_type,

        city,

        capacity,

        inventory,

        daily_demand,

        safety_stock,

    ) in node_specs:

        node = SupplyNode(

            company_id=company_id,

            code=code,

            name=name,

            node_type=node_type,

            country=(

                None

                if country

                == "Unknown"

                else country

            ),

            city=city,

            latitude=None,

            longitude=None,

            capacity=capacity,

            current_inventory=inventory,

            daily_demand=daily_demand,

            safety_stock=safety_stock,

            active=True,

        )



        db.add(node)

        db.flush()



        nodes[code] = node



    route_specs = [

        (

            "SUP_01",

            "PLANT_01",

            "road",

            1200,

            1.0,

            800,

            1.0,

        ),

        (

            "PLANT_01",

            "PORT_A",

            "road",

            2200,

            1.5,

            700,

            1.0,

        ),

        (

            "PORT_A",

            "DC_01",

            "rail",

            5200,

            3.0,

            600,

            0.4,

        ),

        (

            "PLANT_01",

            "PORT_B",

            "rail",

            4800,

            3.0,

            600,

            0.4,

        ),

        (

            "PORT_B",

            "DC_01",

            "road",

            6500,

            2.5,

            500,

            1.0,

        ),

        (

            "DC_01",

            "WH_01",

            "road",

            2600,

            1.0,

            500,

            1.0,

        ),

        (

            "WH_01",

            "CUST_01",

            "road",

            900,

            0.5,

            450,

            1.0,

        ),

        (

            "DC_01",

            "CUST_01",

            "road",

            3300,

            1.5,

            400,

            1.0,

        ),

    ]



    for (

        source_code,

        destination_code,

        mode,

        cost,

        lead_time,

        capacity,

        fuel_dependency,

    ) in route_specs:

        db.add(

            SupplyRoute(

                company_id=company_id,

                source_node_id=(

                    nodes[

                        source_code

                    ].id

                ),

                destination_node_id=(

                    nodes[

                        destination_code

                    ].id

                ),

                transport_mode=mode,

                base_cost=cost,

                lead_time_days=lead_time,

                capacity=capacity,

                fuel_dependency=fuel_dependency,

                active=True,

            )

        )



    db.commit()



    return {

        "status": "ok",

        "nodes_created":

            len(node_specs),

        "routes_created":

            len(route_specs),

        "message": (

            "Synthetic demo network created. "

            "These operational values are "

            "estimated/demo data, not verified "

            f"facts about {company.name}."

        ),

    }





def _normalize_header(

    value,

) -> str:

    return (

        str(value or "")

        .strip()

        .lower()

        .replace(" ", "_")

        .replace("-", "_")

    )





def _sheet_records(

    sheet,

) -> list[dict]:

    rows = list(

        sheet.iter_rows(

            values_only=True

        )

    )



    if not rows:

        return []



    headers = [

        _normalize_header(

            value

        )

        for value in rows[0]

    ]



    records = []



    for row in rows[1:]:

        if not any(

            value is not None

            and str(value).strip()

            for value in row

        ):

            continue



        record = {}



        for index, header in enumerate(

            headers

        ):

            if not header:

                continue



            record[header] = (

                row[index]

                if index < len(row)

                else None

            )



        records.append(record)



    return records





@router.post(

    "/import-excel/{company_id}"

)

async def import_excel(

    company_id: int,

    request: Request,

    filename: str = "network.xlsx",

    db: Session = Depends(

        get_db

    ),

):

    company = db.get(

        Company,

        company_id,

    )



    if company is None:

        raise HTTPException(

            status_code=404,

            detail=(

                "Company workspace "

                "not found."

            ),

        )



    try:

        from openpyxl import (

            load_workbook,

        )

    except ImportError:

        raise HTTPException(

            status_code=500,

            detail=(

                "Excel import requires "

                "openpyxl. Run: "

                ".\\\\.venv\\\Scripts\\\python.exe "

                "-m pip install openpyxl"

            ),

        )



    raw = await request.body()



    if not raw:

        raise HTTPException(

            status_code=400,

            detail=(

                "The uploaded Excel file "

                "is empty."

            ),

        )



    try:

        workbook = load_workbook(

            filename=BytesIO(raw),

            data_only=True,

        )

    except Exception as error:

        raise HTTPException(

            status_code=400,

            detail=(

                "Unable to read Excel "

                f"file: {error}"

            ),

        )



    sheet_lookup = {

        name.lower():

            workbook[name]

        for name

        in workbook.sheetnames

    }



    nodes_sheet = (

        sheet_lookup.get(

            "nodes"

        )

    )



    routes_sheet = (

        sheet_lookup.get(

            "routes"

        )

    )



    if nodes_sheet is None:

        raise HTTPException(

            status_code=400,

            detail=(

                "Excel must contain a "

                "sheet named Nodes."

            ),

        )



    node_records = (

        _sheet_records(

            nodes_sheet

        )

    )



    route_records = (

        _sheet_records(

            routes_sheet

        )

        if routes_sheet

        is not None

        else []

    )



    nodes_by_code = {

        node.code:

            node

        for node in (

            db.query(SupplyNode)

            .filter(

                SupplyNode.company_id

                == company_id

            )

            .all()

        )

    }



    nodes_imported = 0



    for item in node_records:

        code = str(

            item.get(

                "code"

            )

            or ""

        ).strip().upper()



        name = str(

            item.get(

                "name"

            )

            or ""

        ).strip()



        node_type = str(

            item.get(

                "node_type"

            )

            or ""

        ).strip().upper()



        if not (

            code

            and name

            and node_type

        ):

            continue



        node = (

            nodes_by_code.get(

                code

            )

        )



        values = {

            "name":

                name,

            "node_type":

                node_type,

            "country":

                item.get(

                    "country"

                ),

            "city":

                item.get(

                    "city"

                ),

            "latitude":

                item.get(

                    "latitude"

                ),

            "longitude":

                item.get(

                    "longitude"

                ),

            "capacity":

                item.get(

                    "capacity"

                ),

            "current_inventory":

                item.get(

                    "current_inventory"

                )

                or 0,

            "daily_demand":

                item.get(

                    "daily_demand"

                )

                or 0,

            "safety_stock":

                item.get(

                    "safety_stock"

                )

                or 0,

            "active":

                True,

        }



        if node is None:

            node = SupplyNode(

                company_id=company_id,

                code=code,

                **values,

            )



            db.add(node)

            db.flush()



            nodes_by_code[

                code

            ] = node

        else:

            for key, value in (

                values.items()

            ):

                setattr(

                    node,

                    key,

                    value,

                )



        nodes_imported += 1



    routes_imported = 0



    for item in route_records:

        source_code = str(

            item.get(

                "source_code"

            )

            or ""

        ).strip().upper()



        destination_code = str(

            item.get(

                "destination_code"

            )

            or ""

        ).strip().upper()



        source = nodes_by_code.get(

            source_code

        )



        destination = (

            nodes_by_code.get(

                destination_code

            )

        )



        if (

            source is None

            or destination is None

        ):

            continue



        existing = (

            db.query(SupplyRoute)

            .filter(

                SupplyRoute.company_id

                    == company_id,

                SupplyRoute.source_node_id

                    == source.id,

                SupplyRoute.destination_node_id

                    == destination.id,

            )

            .first()

        )



        values = {

            "transport_mode":

                str(

                    item.get(

                        "transport_mode"

                    )

                    or "road"

                ).strip().lower(),

            "base_cost":

                item.get(

                    "base_cost"

                )

                or item.get(

                    "cost"

                )

                or 0,

            "lead_time_days":

                item.get(

                    "lead_time_days"

                )

                or item.get(

                    "lead_time"

                )

                or 0,

            "capacity":

                item.get(

                    "capacity"

                )

                or 0,

            "fuel_dependency":

                item.get(

                    "fuel_dependency"

                )

                if item.get(

                    "fuel_dependency"

                )

                is not None

                else 1,

            "active":

                True,

        }



        if existing is None:

            db.add(

                SupplyRoute(

                    company_id=company_id,

                    source_node_id=source.id,

                    destination_node_id=(

                        destination.id

                    ),

                    **values,

                )

            )

        else:

            for key, value in (

                values.items()

            ):

                setattr(

                    existing,

                    key,

                    value,

                )



        routes_imported += 1



    db.commit()



    return {

        "status": "ok",

        "filename":

            filename,

        "nodes_imported":

            nodes_imported,

        "routes_imported":

            routes_imported,

    }
