<?php
/*
  Fody
  Copyright (C) 2018  Tomas Kasparek

  This program is free software; you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation; either version 2 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License along
  with this program; if not, write to the Free Software Foundation, Inc.,
  51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
*/

require_once dirname(__FILE__).'/config.php';
require_once dirname(__FILE__).'/common.php';

fody_session_start();

$db = pg_connect("host=".SERVER." dbname=".DATABASE." user=".USERNAME." password=".PASSWORD);

// get API command
$cmd = '';
if(isset($_GET['cmd'])) $cmd = $_GET['cmd'];
if(isset($_POST['cmd'])) $cmd = $_POST['cmd'];

if ($cmd == "show" || $cmd == "own" || $cmd == "close") {
  flush_cors_headers(API_RO);
} else {
  flush_cors_headers(API_RW);
}

// generic parameters for all/most commands - GET only - for reading
// --------------------------------------------------
// bool disabled - sql_get_enabled() - return even disabled photos, if not set, filter out disabled photos from output
// int limit - sql_get_limit() - limit numer of output results to this number
// int,int,int,int bbox - sql_get_bbox() - limit result to given bbox
// --------------------------------------------------

// found what should be done
switch ($cmd) {
  case "logged" : // req: - optional: -
      if(is_logged()) {
        error_log("logged check OK: ".get_logged_user());
        header("HTTP/1.0 200 OK");
      } else {
        error_log("logged check FAIL");
        header("HTTP/1.0 401 Unauthorized");
      }
    break;
  case "show" : // req: - optional: bbox, id, disabled, other column filters
      photos_to_json();
    break;
  case "own" : // req: - optional: bbox, id, disabled, other column filters
      if (is_logged()) $where_sql = 'photo.by = '.get_author_id(get_logged_user());
      photos_to_json($where_sql);
    break;
  case "close" : // req: distance, lat, lon optional: limit, id, disabled
    if(isset($_GET['distance']) && is_numeric($_GET['distance'])
        && isset($_GET['lat']) && is_numeric($_GET['lat'])
        && isset($_GET['lon']) && is_numeric($_GET['lon'])){
      $where_sql = "ST_DistanceSphere(photo.geom, ST_GeomFromText('POINT(".$_GET['lon']." ".$_GET['lat'].")',4326)) < ".$_GET['distance'];
      photos_to_json($where_sql, true, $_GET['lat'], $_GET['lon']);
    } else {
      header("HTTP/1.0 400 Bad Request");
      echo "Requested parameters not found";
    }
    break;
  case "move" : // req: id, lat, lon optional: msg
    if(isset($_POST['id']) && is_numeric($_POST['id'])
        && isset($_POST['lat']) && is_numeric($_POST['lat'])
        && isset($_POST['lon']) && is_numeric($_POST['lon'])){
      if(is_logged()){
        update_photo($_POST['id'], "geom = ST_GeomFromText('POINT(".$_POST['lon']." ".$_POST['lat'].")', 4326)");

        if(isset($_POST['note'])){
          add_note($_POST['id'], $_POST['note']);
        }
      } else {
        error_log("unauthorized request for move ".$_POST['id']." to ".$_POST['lat']." ".$_POST['lon']);
        header("HTTP/1.0 401 Unauthorized");
      }
    } else {
      header("HTTP/1.0 400 Bad Request");
      echo "Requested parameters not found";
    }
    break;
  case "licenses" : // req: - optional: -
      licenses_to_json();
    break;
  case "add" : // req: file, lat, lon, gp_type optional: ref, note, gp_content
    if(isset($_FILES['uploadedfile']['error']) && $_FILES['uploadedfile']['error'] == UPLOAD_ERR_OK
        && isset($_POST['gp_type']) && in_array($_POST['gp_type'], tag_major_to_array())
        && isset($_POST['lat']) && is_numeric($_POST['lat'])
        && isset($_POST['lon']) && is_numeric($_POST['lon'])){
      if(is_logged()){
        //uloz fotku
        $new_id = add_photo();

        if($new_id > 0 && isset($_POST['note']) && $_POST['note'] != ''){
          add_note($new_id, $_POST['note']);
        }
      } else {
        error_log("unauthorized request for add ".$_POST['ref']." to ".$_POST['lat']." ".$_POST['lon']);
        header("HTTP/1.0 401 Unauthorized");
      }
    } else {
      error_log("missing param for add ".$_POST['gp_type']." ".$_POST['lat']." ".$_POST['lon']);
      header("HTTP/1.0 400 Bad Request");
      echo "Requested parameters not found";
    }
    break;
  case "tags" : // req: - optional: -
      tag_structure_to_json();
    break;
  default :
    header("HTTP/1.0 400 Bad Request");
    exit;
    break;
}

pg_close($db);

function sql_get_limit(){ //{{{
 if(isset($_GET['limit']) && is_numeric($_GET['limit'])) {
   return " LIMIT ".$_GET['limit']." ";
 } 
} //}}}

function sql_get_enabled(){ //{{{
  if(isset($_GET['disabled'])) {
    return "true ";
  } else {
    return " photo.is_enabled ";
  } 
} //}}}

function sql_get_bbox(){ //{{{
  if(isset($_GET['bbox']) && preg_match('/([\-\.0-9]{1,20}),([\-\.0-9]{1,20}),([\-\.0-9]{1,20}),([\-\.0-9]{1,20})/', $_GET['bbox'], $match)) {
   return " photo.geom && ST_MakeEnvelope($match[1], $match[2], $match[3], $match[4]) ";
  } else {
   return "true";
  } 
} //}}}

function sql_get_id(){ //{{{
  if(isset($_GET['id']) && is_numeric($_GET['id'])) {
   return " photo.id = ".$_GET['id']." ";
  } else {
   return "true";
  } 
} //}}}

// $order_dist - sort resutls based on distance to given $lat, $lon point, not photo ID
function photos_to_json($where_sql = 'true', $order_dist = 'false', $lat = 0, $lon = 0) { //{{{
  $query="SELECT photo.id, author.name, photo.ref, photo.tags, photo.created, ST_AsText(photo.geom) AS geom, is_enabled
    FROM photo JOIN author ON author.id = photo.by WHERE ".sql_get_enabled()." AND ".sql_get_bbox()." AND ".sql_get_id()." AND $where_sql ORDER BY photo.id ASC ".sql_get_limit().";";
  if($order_dist){
    $query="SELECT photo.id, author.name, photo.ref, photo.tags, photo.created, ST_AsText(photo.geom) AS geom, is_enabled, ST_DistanceSphere(photo.geom, ST_GeomFromText('POINT($lon $lat)',4326)) AS dist
      FROM photo JOIN author ON author.id = photo.by WHERE ".sql_get_enabled()." AND ".sql_get_bbox()." AND ".sql_get_id()." AND $where_sql ORDER BY dist ASC ".sql_get_limit().";";
  }
  //echo $query;
  $res = pg_query($query);

  $geojson = array(
    'type'      => 'FeatureCollection',
    'features'  => array()
  );

  while ($a = pg_fetch_object($res)){
    list($lat, $lon) = geom_to_latlon($a->geom);
    $dist = $order_dist ? $a->dist : 0;

    $features = array (
      'type' => 'Feature', 
      'geometry' => array (
        'type' => 'Point',
        'coordinates' => array($lon, $lat)
      ),
      'properties' => array(
        'id' => $a->id,
        'author' => $a->name,
        'ref' => $a->ref,
        'tags' => str_replace(array('=>','"',', '), array(':', '', ';'), $a->tags), //FIXME
        'created' => $a->created,
        'enabled' => $a->is_enabled,
        'distance' => $dist
      )
    );
    array_push($geojson['features'], $features);
  }
  pg_free_result($res);

  header('Content-type: application/json');
  echo json_encode($geojson, JSON_NUMERIC_CHECK);
  exit;
} //}}}

function tag_structure_to_json() { //{{{
  $json = array();
  $query="SELECT tag_id, ref_req, name, describe FROM tags_primary JOIN photo_tag ON tags_primary.tag_id = photo_tag.id ORDER BY tag_id ASC;";
  //echo $query;
  $res = pg_query($query);
  while ($t = pg_fetch_object($res)){
    $dep = array();
    $query="SELECT tag_id, name, photo_tag.describe, priority FROM tags_deps JOIN photo_tag ON tags_deps.tag_id = photo_tag.id WHERE tags_deps.parent_id = $t->tag_id ORDER BY priority DESC";
    //echo $query;
    $res_dep = pg_query($query);
    while ($d = pg_fetch_object($res_dep)){
      array_push($dep, array('id' => $d->tag_id, 'name' => $d->name, 'describe' => $d->describe));
    }
    pg_free_result($res_dep);

    $tag = array (
      'id' => $t->tag_id,
      'ref' => $t->ref_req,
      'name' => $t->name,
      'describe' => $t->describe,
      'secondary' => $dep,
    );
    array_push($json, $tag);
  }
  pg_free_result($res);

  header('Content-type: application/json');
  echo json_encode($json, JSON_NUMERIC_CHECK);
  exit;
} //}}}

function tag_major_to_array() { //{{{
  $tags = array();
  $query="SELECT name FROM photo_tag JOIN tags_primary ON tags_primary.tag_id = photo_tag.id;";
  //echo $query;
  $res = pg_query($query);
  while ($t = pg_fetch_object($res)){
    array_push($tags, $t->name);
  }
  pg_free_result($res);

  return $tags;
} //}}}

function tag_minor_to_array($major) { //{{{
  $tags = array();

  //get major tag ID for dep info later
  $query="SELECT id FROM photo_tag WHERE name = '$major';";
  $res = pg_query($query);
  $major_id = pg_fetch_object($res)->id;
  pg_free_result($res);

  $query="SELECT tag_id, name FROM tags_deps JOIN photo_tag ON tags_deps.tag_id = photo_tag.id WHERE tags_deps.parent_id = $major_id ORDER BY tag_id ASC";
  //echo $query;
  $res = pg_query($query);
  while ($t = pg_fetch_object($res)){
    array_push($tags, $t->name);
  }
  pg_free_result($res);

  return $tags;
} //}}}

function licenses_to_json() { //{{{
  $query="SELECT license.id, license.short, license.name FROM license ORDER BY license.name ASC";
  //echo $query;
  $res = pg_query($query);

  $json = array(
    'licenses' => array()
  );

  while ($a = pg_fetch_object($res)){
    $l = array ( $a->short => $a->name);
    array_push($json['licenses'], $l);
  }
  pg_free_result($res);

  header('Content-type: application/json');
  echo json_encode($json, JSON_NUMERIC_CHECK);
  exit;
} //}}}

function flush_cors_headers($api = API_RO){ //{{{
  global $cors_allowed_domains;
  global $cors_allowed_ro_domains;

  $origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';

  //error_log("checking origin: $api - $origin");

  //full access - check first
  if (in_array($origin, $cors_allowed_domains)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
    header('Vary: Origin');
    return;
  }

  //does not work - check RO allowed domains
  if ($api == API_RO && in_array($origin, $cors_allowed_ro_domains)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
    header('Vary: Origin');
    return;
  }
} //}}}

# returns an array of latitude and longitude from the Image file
#   ---- http://stackoverflow.com/a/19420991 ----
function read_gps_location($file) { //{{{
 if (is_file($file)) {
    $info = exif_read_data($file);
    if (isset($info['GPSLatitude']) && isset($info['GPSLongitude']) &&
      isset($info['GPSLatitudeRef']) && isset($info['GPSLongitudeRef']) &&
      in_array($info['GPSLatitudeRef'], array('E','W','N','S')) && in_array($info['GPSLongitudeRef'], array('E','W','N','S'))) {

      $GPSLatitudeRef  = strtolower(trim($info['GPSLatitudeRef']));
      $GPSLongitudeRef = strtolower(trim($info['GPSLongitudeRef']));
      $lat_degrees_a = explode('/',$info['GPSLatitude'][0]);
      $lat_minutes_a = explode('/',$info['GPSLatitude'][1]);
      $lat_seconds_a = explode('/',$info['GPSLatitude'][2]);
      $lng_degrees_a = explode('/',$info['GPSLongitude'][0]);
      $lng_minutes_a = explode('/',$info['GPSLongitude'][1]);
      $lng_seconds_a = explode('/',$info['GPSLongitude'][2]);
      $lat_degrees = $lat_degrees_a[0] / $lat_degrees_a[1];
      $lat_minutes = $lat_minutes_a[0] / $lat_minutes_a[1];
      $lat_seconds = $lat_seconds_a[0] / $lat_seconds_a[1];
      $lng_degrees = $lng_degrees_a[0] / $lng_degrees_a[1];
      $lng_minutes = $lng_minutes_a[0] / $lng_minutes_a[1];
      $lng_seconds = $lng_seconds_a[0] / $lng_seconds_a[1];
      $lat = (float) $lat_degrees+((($lat_minutes*60)+($lat_seconds))/3600);
      $lng = (float) $lng_degrees+((($lng_minutes*60)+($lng_seconds))/3600);

      //If the latitude is South, make it negative.
      //If the longitude is West, make it negative
      $GPSLatitudeRef  == 's' ? $lat *= -1 : '';
      $GPSLongitudeRef == 'w' ? $lng *= -1 : '';

      return array(
        'lat' => $lat,
        'lng' => $lng
      );
    }
  }
  return false;
} //}}}

function add_photo(){ //{{{
  //checked for corrrect value previously
  $lat = $_POST['lat'];
  $lon = $_POST['lon'];
  $gp_type = $_POST['gp_type'];
  $tags_minor = tag_minor_to_array($gp_type);

  $error_message = '';

  //ref
  if (isset($_POST['ref']) && preg_match('/^[a-zA-Z0-9\/\.; ]+$/', $_POST['ref'])) { $ref = str_replace(" ", "", $_POST['ref']); } else { $ref = "none"; }

  $tags = ' "'.$gp_type.'"=>"", ';
  if (isset($_POST['gp_content'])) {
    foreach($_POST['gp_content'] as $i) {
      if(in_array($i, $tags_minor)) $tags .= '"'.$i.'"=>"", ';
    }
  }
  $tags = rtrim($tags, ', ');

  $author = get_logged_user();
  if(($author_id = get_author_id($author)) == -1){
    header("HTTP/1.0 403 Forbidden");
    return;
  }

  error_log("add photo by $author file error: ".$_FILES['uploadedfile']['error']." gp_type: $gp_type lat/lon: $lat/$lon, ref: $ref");

  //checks for uploaded file
  if (file_exists($_FILES['uploadedfile']['tmp_name'])) {
    $result = 1;
  } else {
    $error_message = "nepodarilo se uploadnout soubor";
    $result = 0;
  }

  if ($result && $_FILES['uploadedfile']['error'] == "1") {
    $error_message = "soubor je prilis velky";
    $result = 0;
  }

  $file_name = pg_escape_string($_FILES['uploadedfile']['name']);

  //control for duplicates in DB via sha256 csum
  if($result){
    $csum = hash_file('sha256', $_FILES['uploadedfile']['tmp_name']);

    //check if this file is already in DB
    $query = "SELECT id FROM photo WHERE csum = '$csum'";
    $res_csum = pg_query($query);
    if(pg_num_rows($res_csum)!=0){
      $colision = pg_fetch_object($res_csum); 
      error_log("Checksum $csum for $author/".$_FILES['uploadedfile']['tmp_name']." found in DB for ".$colision->id);

      $error_message = "tato fotka jiz exituje ($colision->id)";
      $result = 0;
    }
    pg_free_result($res_csum);
  }

  if ($result && mime_content_type($_FILES['uploadedfile']['tmp_name']) != 'image/jpeg') {
    $error_message = "spatny soubor: ocekavan image/jpeg";
    $result = 0;
  }

  if ($result && $_FILES['uploadedfile']['size'] < PHOTO_SIZE_MIN){
    $error_message = "prilis maly soubor, pouzijte alespon ".round(PHOTO_SIZE_MIN/1024)."kB";
    $result = 0;
  }

  if($result) {
    //check - no exif - datetime
    $exif = @exif_read_data($_FILES['uploadedfile']['tmp_name'], 'IFD0');
    if (isset($exif['DateTime'])) {
      $c =  date_parse_from_format("Y:m:d H:i:s", $exif['DateTime']);
      if($c['year'] < 2000){
        $error_message = "Chybne datum porizeni snimku v EXIF - rok < 2000";
        $result = 0;
      }
      $created = sprintf("%04d.%02d.%02d %02d:%02d:%02d", $c['year'], $c['month'], $c['day'], $c['hour'], $c['minute'], $c['second']);
    } else if (isset($exif['DateTimeOriginal'])){
      $c =  date_parse_from_format("Y:m:d H:i:s", $exif['DateTimeOriginal']);
      if($c['year'] < 2000){
        $error_message = "Chybne datum porizeni snimku v EXIF - rok < 2000";
        $result = 0;
      }
      $created = sprintf("%04d.%02d.%02d %02d:%02d:%02d", $c['year'], $c['month'], $c['day'], $c['hour'], $c['minute'], $c['second']);
    } else {
      $error_message = "nepodarilo se nacist EXIF datum a cas vytvoreni";
      $result = 0;
    }
  }

  //do we have coords from form or use from EXIF?
  if ($result && !$lat && !$lon){
    $ll = read_gps_location($_FILES['uploadedfile']['tmp_name']);
    if (!$ll) {
      $result = 0;
      $error_message = "poslano latlon 0,0 a nepodarilo se zjistit souradnice z exif";
    } else {
      $lat = $ll['lat'];
      $lon = $ll['lng'];
    }
  }

  if ($result && $lat > 180 or $lon > 180 or $lat < -180 or $lon < -180) {
    $error_message = "chybné souřadnice";
    $result = 0;
  }

  if ($result) {
    error_log("insert photo into DB: $file_name, $tags, $created");

    //insert entry into DB
    $query = "INSERT INTO photo (file_name, by, ref, tags, created, geom, csum)
              VALUES('$file_name', '$author_id','$ref', '$tags', '$created', ST_GeomFromText('POINT(".$lon." ".$lat.")', 4326),'$csum') RETURNING id";

    //echo $query."<br/>\n";
    if(!($res_ins = pg_query($query))){
      $error_message = "chyba vlozeni do databaze";
      $result = 0;
    };

    //get ID of last inserted photo
    $last_photo = pg_fetch_object($res_ins)->id;

    pg_free_result($res_ins);
  }

  //move file
  if ($result && !move_uploaded_file($_FILES['uploadedfile']['tmp_name'], PHOTOS_DIR.$last_photo.".jpg")) {
    $error_message = "Chyba pri presouvani souboru z apache upload";
    $result = 0;
  }

  //generate thumbnail 250px for new image
  if($result){
    //error_log("/usr/bin/convert -scale x250 ".PHOTOS_DIR.$last_photo.".jpg ".PHOTOS_DIR."250px/".$last_photo.".jpg");
    exec("/usr/bin/convert -scale x250 ".PHOTOS_DIR.$last_photo.".jpg ".PHOTOS_DIR."250px/".$last_photo.".jpg");

    //error_log("/usr/local/bin/exifautotran ".PHOTOS_DIR."250px/".$last_photo.".jpg");
    exec("/usr/local/bin/exifautotran ".PHOTOS_DIR."250px/".$last_photo.".jpg");
  }

  //upload failed, remove temporary file
  if($result == 0) {
    @unlink($_FILES['uploadedfile']['tmp_name']);
  }

  print "$result: '$error_message'";

  //if everythinkg is OK return last photo ID
  return $result ? $last_photo : '0';
} //}}}

// vim: tw=0
