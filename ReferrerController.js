<?php
// File: /gac/api/controllers/ReferrerController.php
// Referrer controller for GAC Client/Job Management System

require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../models/Referrer.php';
require_once __DIR__ . '/../models/ReferrerType.php';
require_once __DIR__ . '/../utils/Response.php';
require_once __DIR__ . '/../utils/Auth.php';

class ReferrerController {
    
    // Properties
    private $database;
    private $db;
    private $referrer;
    private $referrerType;
    
    // Constructor
    public function __construct() {
        try {
            // Initialize database connection
            $this->database = new Database();
            $this->db = $this->database->getConnection();
            
            if (!$this->db) {
                Response::serverError("Database connection failed");
                exit;
            }
            
            // Initialize referrer and referrer type models
            $this->referrer = new Referrer($this->db);
            $this->referrerType = new ReferrerType($this->db);
            
            // Initialize default referrer types if needed
            if (method_exists($this->referrerType, 'initializeDefaultTypes')) {
                $this->referrerType->initializeDefaultTypes();
            }
        } catch (Exception $e) {
            error_log("ReferrerController initialization error: " . $e->getMessage());
            Response::serverError("Failed to initialize controller: " . $e->getMessage());
            exit;
        }
    }
    
    // Create referrer method
    public function create() {
        // Check if request method is POST
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            Response::error("Method not allowed", 405);
            return;
        }
        
        // Check if user is authenticated and is admin or staff
        if (!Auth::isAuthenticated()) {
            Response::unauthorized("Authentication required");
            return;
        }
        
        if (!Auth::isStaff()) {
            Response::forbidden("Only staff members can create referrers");
            return;
        }
        
        try {
            // Get posted data
            $json_data = file_get_contents("php://input");
            if (!$json_data) {
                Response::badRequest("No data provided");
                return;
            }
            
            $data = json_decode($json_data);
            
            // Check if JSON was valid
            if ($data === null && json_last_error() !== JSON_ERROR_NONE) {
                Response::badRequest("Invalid JSON: " . json_last_error_msg());
                return;
            }
            
            // Check if required fields are present
            if (
                empty($data->referrer_name) || 
                empty($data->referrer_type)
            ) {
                Response::badRequest("Referrer name and type are required");
                return;
            }
            
            // Get next referrer ID
            $this->referrer->idreferrer = $this->referrer->getNextId();
            
            // Set referrer properties
            $this->referrer->referrer_name = $data->referrer_name;
            $this->referrer->referrer_type = $data->referrer_type;
            
            // Create the referrer
            if ($this->referrer->create()) {
                Response::success("Referrer created successfully", array(
                    "idreferrer" => $this->referrer->idreferrer,
                    "referrer_name" => $this->referrer->referrer_name,
                    "referrer_type" => $this->referrer->referrer_type
                ), 201);
            } else {
                Response::serverError("Unable to create referrer");
            }
        } catch (Exception $e) {
            // Log error
            error_log("Referrer creation error: " . $e->getMessage());
            Response::serverError("Error creating referrer: " . $e->getMessage());
        }
    }
    
    // Read all referrers method with optional type filter
    public function readAll() {
        try {
            // Check if user is authenticated
            if (!Auth::isAuthenticated()) {
                Response::unauthorized("Authentication required");
                return;
            }
            
            // Get referrer type filter if provided
            $referrer_type = isset($_GET['type']) ? $_GET['type'] : null;
            
            // Get referrers from database
            $stmt = $this->referrer->readAll(['referrer_type' => $referrer_type]);
            
            // Check if stmt is a valid PDOStatement
            if (!($stmt instanceof PDOStatement)) {
                Response::serverError("Failed to fetch referrers");
                return;
            }
            
            $num = $stmt->rowCount();
            
            // Check if any referrers found
            if ($num > 0) {
                // Referrers array
                $referrers_arr = array();
                
                // Retrieve and format data
                while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    if (!is_array($row)) continue;
                    
                    $referrer_item = array(
                        "idreferrer" => $row['idreferrer'],
                        "referrer_name" => $row['referrer_name'],
                        "referrer_type" => $row['referrer_type'],
                        "referrer_type_name" => isset($row['referrer_type_name']) ? $row['referrer_type_name'] : null,
                        "referrer_type_desc" => isset($row['referrer_type_desc']) ? $row['referrer_type_desc'] : null
                    );
                    
                    array_push($referrers_arr, $referrer_item);
                }
                
                Response::success("Referrers retrieved successfully", $referrers_arr);
            } else {
                Response::success("No referrers found", array());
            }
        } catch (Exception $e) {
            error_log("ReferrerController readAll error: " . $e->getMessage());
            Response::serverError("Error retrieving referrers: " . $e->getMessage());
        }
    }
    
    // Read single referrer method
    public function readOne($id) {
        // Log the method call
        error_log("ReferrerController::readOne called with ID: " . $id);
        
        // Check if user is authenticated
        if (!Auth::isAuthenticated()) {
            Response::unauthorized("Authentication required");
            return;
        }
        
        // Set referrer ID
        $this->referrer->idreferrer = $id;
        
        // Get referrer data from database
        if ($this->referrer->readOne()) {
            // Count jobs using this referrer
            $job_count = $this->referrer->countJobs();
            
            // Create referrer array
            $referrer_arr = array(
                "idreferrer" => $this->referrer->idreferrer,
                "referrer_name" => $this->referrer->referrer_name,
                "referrer_type" => $this->referrer->referrer_type,
                "job_count" => $job_count
            );
            
            Response::success("Referrer retrieved successfully", $referrer_arr);
        } else {
            Response::notFound("Referrer not found");
        }
    }
    
    // Update referrer method
    public function update($id) {
        try {
            // Check if request method is PUT
            if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
                Response::error("Method not allowed", 405);
                return;
            }
            
            // Check if user is authenticated and is admin or staff
            if (!Auth::isAuthenticated()) {
                Response::unauthorized("Authentication required");
                return;
            }
            
            if (!Auth::isStaff()) {
                Response::forbidden("Only staff members can update referrers");
                return;
            }
            
            // Set referrer ID
            $this->referrer->idreferrer = $id;
            
            // Check if referrer exists
            if (!$this->referrer->readOne()) {
                Response::notFound("Referrer not found");
                return;
            }
            
            // Get posted data
            $json_data = file_get_contents("php://input");
            if (!$json_data) {
                Response::badRequest("No data provided");
                return;
            }
            
            // Debug logging
            error_log("Received PUT data for referrer {$id}: " . $json_data);
            
            // Parse JSON data
            $data = json_decode($json_data);
            
            // Check if JSON was valid
            if ($data === null) {
                error_log("Invalid JSON: " . json_last_error_msg() . " - Data: " . $json_data);
                Response::badRequest("Invalid JSON: " . json_last_error_msg());
                return;
            }
            
            // Check if required fields are present
            if (empty($data->referrer_name)) {
                Response::badRequest("Referrer name is required");
                return;
            }
            
            if (empty($data->referrer_type)) {
                Response::badRequest("Referrer type is required");
                return;
            }
            
            // Set referrer properties
            $this->referrer->referrer_name = $data->referrer_name;
            $this->referrer->referrer_type = $data->referrer_type;
            
            // Update the referrer
            if ($this->referrer->update()) {
                Response::success("Referrer updated successfully", array(
                    "idreferrer" => $this->referrer->idreferrer,
                    "referrer_name" => $this->referrer->referrer_name,
                    "referrer_type" => $this->referrer->referrer_type
                ));
            } else {
                Response::serverError("Unable to update referrer");
            }
        } catch (Exception $e) {
            error_log("Referrer update error: " . $e->getMessage() . " - Trace: " . $e->getTraceAsString());
            Response::serverError("Error updating referrer: " . $e->getMessage());
        }
    }
    
    // Delete referrer method
    public function delete($id) {
        // Check if request method is DELETE
        if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
            Response::error("Method not allowed", 405);
            return;
        }
        
        // Check if user is authenticated and is admin
        if (!Auth::isAuthenticated()) {
            Response::unauthorized("Authentication required");
            return;
        }
        
        if (!Auth::isAdmin()) {
            Response::forbidden("Only administrators can delete referrers");
            return;
        }
        
        // Set referrer ID
        $this->referrer->idreferrer = $id;
        
        // Check if referrer exists
        if (!$this->referrer->readOne()) {
            Response::notFound("Referrer not found");
            return;
        }
        
        // Try to delete the referrer
        if ($this->referrer->delete()) {
            Response::success("Referrer deleted successfully");
        } else {
            // If deletion fails, it's likely because the referrer is being used in jobs
            Response::badRequest("Cannot delete this referrer as it is used in one or more jobs");
        }
    }
    
    // Search referrers method
    public function search() {
        // Check if user is authenticated
        if (!Auth::isAuthenticated()) {
            Response::unauthorized("Authentication required");
            return;
        }
        
        // Get search keyword from URL parameters
        $keywords = isset($_GET['q']) ? $_GET['q'] : '';
        
        // Check if keyword is provided
        if (empty($keywords)) {
            Response::badRequest("Search keyword is required");
            return;
        }
        
        // Search referrers in database
        $stmt = $this->referrer->search($keywords);
        $num = $stmt->rowCount();
        
        // Check if any referrers found
        if ($num > 0) {
            // Referrers array
            $referrers_arr = array();
            
            // Retrieve and format data
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                extract($row);
                
                $referrer_item = array(
                    "idreferrer" => $idreferrer,
                    "referrer_name" => $referrer_name,
                    "referrer_type" => $referrer_type,
                    "referrer_type_name" => $referrer_type_name
                );
                
                array_push($referrers_arr, $referrer_item);
            }
            
            Response::success("Referrers found", $referrers_arr);
        } else {
            Response::success("No referrers found for the search criteria", array());
        }
    }
    
    // Get all referrer types
    public function getReferrerTypes() {
        try {
            // Check if user is authenticated
            if (!Auth::isAuthenticated()) {
                Response::unauthorized("Authentication required");
                return;
            }
            
            // Get all referrer types
            $stmt = $this->referrerType->readAll();
            
            // Check if stmt is a valid PDOStatement
            if (!($stmt instanceof PDOStatement)) {
                Response::serverError("Failed to fetch referrer types");
                return;
            }
            
            $num = $stmt->rowCount();
            
            // Check if any types found
            if ($num > 0) {
                // Types array
                $types_arr = array();
                
                // Retrieve and format data
                while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    if (!is_array($row)) continue;
                    
                    $type_item = array(
                        "idreferrer_type" => $row['idreferrer_type'],
                        "referrer_type_name" => $row['referrer_type_name'],
                        "referrer_type_desc" => $row['referrer_type_desc']
                    );
                    
                    array_push($types_arr, $type_item);
                }
                
                Response::success("Referrer types retrieved successfully", $types_arr);
            } else {
                Response::success("No referrer types found", array());
            }
        } catch (Exception $e) {
            error_log("ReferrerController getReferrerTypes error: " . $e->getMessage());
            Response::serverError("Error retrieving referrer types: " . $e->getMessage());
        }
    }
    
    // Create referrer type method
    public function createReferrerType() {
        // Check if request method is POST
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            Response::error("Method not allowed", 405);
            return;
        }
        
        // Check if user is authenticated and is admin
        if (!Auth::isAuthenticated()) {
            Response::unauthorized("Authentication required");
            return;
        }
        
        if (!Auth::isAdmin()) {
            Response::forbidden("Only administrators can create referrer types");
            return;
        }
        
        try {
            // Get posted data
            $json_data = file_get_contents("php://input");
            if (!$json_data) {
                Response::badRequest("No data provided");
                return;
            }
            
            $data = json_decode($json_data);
            
            // Check if JSON was valid
            if ($data === null && json_last_error() !== JSON_ERROR_NONE) {
                Response::badRequest("Invalid JSON: " . json_last_error_msg());
                return;
            }
            
            // Check if required fields are present
            if (empty($data->referrer_type_name)) {
                Response::badRequest("Referrer type name is required");
                return;
            }
            
            // Get next referrer type ID
            $this->referrerType->idreferrer_type = $this->referrerType->getNextId();
            
            // Set referrer type properties
            $this->referrerType->referrer_type_name = $data->referrer_type_name;
            $this->referrerType->referrer_type_desc = !empty($data->referrer_type_desc) ? $data->referrer_type_desc : '';
            
            // Create the referrer type
            if ($this->referrerType->create()) {
                Response::success("Referrer type created successfully", array(
                    "idreferrer_type" => $this->referrerType->idreferrer_type,
                    "referrer_type_name" => $this->referrerType->referrer_type_name,
                    "referrer_type_desc" => $this->referrerType->referrer_type_desc
                ), 201);
            } else {
                Response::serverError("Unable to create referrer type");
            }
        } catch (Exception $e) {
            error_log("ReferrerController createReferrerType error: " . $e->getMessage());
            Response::serverError("Error creating referrer type: " . $e->getMessage());
        }
    }
    
    // Delete referrer type method
    public function deleteReferrerType($id) {
        // Log the method call for debugging
        error_log("ReferrerController::deleteReferrerType called with ID: " . $id);
        
        // Check if request method is DELETE
        if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
            error_log("Method not allowed: " . $_SERVER['REQUEST_METHOD']);
            Response::error("Method not allowed", 405);
            return;
        }
        
        // Check if user is authenticated and is admin
        if (!Auth::isAuthenticated()) {
            Response::unauthorized("Authentication required");
            return;
        }
        
        if (!Auth::isAdmin()) {
            Response::forbidden("Only administrators can delete referrer types");
            return;
        }
        
        // Set referrer type ID
        $this->referrerType->idreferrer_type = $id;
        
        // Check if referrer type exists
        if (!$this->referrerType->readOne()) {
            Response::notFound("Referrer type not found");
            return;
        }
        
        // Try to delete the referrer type
        if ($this->referrerType->delete()) {
            Response::success("Referrer type deleted successfully");
        } else {
            // If deletion fails, it's likely because the type is being used by referrers
            Response::badRequest("Cannot delete this referrer type as it is used by one or more referrers");
        }
    }
    
    // Read single referrer type method
    public function readReferrerType($id) {
        // Log the method call
        error_log("ReferrerController::readReferrerType called with ID: " . $id);
        
        // Check if user is authenticated
        if (!Auth::isAuthenticated()) {
            Response::unauthorized("Authentication required");
            return;
        }
        
        // Set referrer type ID
        $this->referrerType->idreferrer_type = $id;
        
        // Get referrer type data from database
        if ($this->referrerType->readOne()) {
            // Count referrers using this type
            $referrer_count = $this->referrerType->countReferrers();
            
            // Create referrer type array
            $type_arr = array(
                "idreferrer_type" => $this->referrerType->idreferrer_type,
                "referrer_type_name" => $this->referrerType->referrer_type_name,
                "referrer_type_desc" => $this->referrerType->referrer_type_desc,
                "referrer_count" => $referrer_count
            );
            
            Response::success("Referrer type retrieved successfully", $type_arr);
        } else {
            Response::notFound("Referrer type not found");
        }
    }
    
    // Update referrer type method
    public function updateReferrerType($id) {
        // Log the method call
        error_log("ReferrerController::updateReferrerType called with ID: " . $id);
        
        // Check if request method is PUT
        if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
            Response::error("Method not allowed", 405);
            return;
        }
        
        // Check if user is authenticated and is admin
        if (!Auth::isAuthenticated()) {
            Response::unauthorized("Authentication required");
            return;
        }
        
        if (!Auth::isAdmin()) {
            Response::forbidden("Only administrators can update referrer types");
            return;
        }
        
        // Set referrer type ID
        $this->referrerType->idreferrer_type = $id;
        
        // Check if referrer type exists
        if (!$this->referrerType->readOne()) {
            Response::notFound("Referrer type not found");
            return;
        }
        
        // Get posted data
        $json_data = file_get_contents("php://input");
        if (!$json_data) {
            Response::badRequest("No data provided");
            return;
        }
        
        // Debug log
        error_log("Received PUT data for referrer type {$id}: " . $json_data);
        
        $data = json_decode($json_data);
        
        // Check if JSON was valid
        if ($data === null && json_last_error() !== JSON_ERROR_NONE) {
            Response::badRequest("Invalid JSON: " . json_last_error_msg());
            return;
        }
        
        // Check if required fields are present
        if (empty($data->referrer_type_name)) {
            Response::badRequest("Referrer type name is required");
            return;
        }
        
        // Set referrer type properties
        $this->referrerType->referrer_type_name = $data->referrer_type_name;
        $this->referrerType->referrer_type_desc = !empty($data->referrer_type_desc) ? $data->referrer_type_desc : '';
        
        // Update the referrer type
        if ($this->referrerType->update()) {
            Response::success("Referrer type updated successfully", array(
                "idreferrer_type" => $this->referrerType->idreferrer_type,
                "referrer_type_name" => $this->referrerType->referrer_type_name,
                "referrer_type_desc" => $this->referrerType->referrer_type_desc
            ));
        } else {
            Response::serverError("Unable to update referrer type");
        }
    }
}
