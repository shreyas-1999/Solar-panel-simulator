;; --- PROJECT: SOLARPRO AUTOCAD AUTOMATION ---
;; --- VERSION: 5.8.1 (SYNTAX & DEFINE FIX) ---

(vl-load-com)

;; --- HELPER MATH FUNCTIONS (Defined first to ensure availability) ---

(defun asin (x) 
  (if (>= (abs x) 1.0) 
    (if (> x 0) (/ pi 2.0) (/ pi -2.0)) 
    (atan x (sqrt (- 1.0 (* x x))))))

(defun tan_lsp (ang) (/ (sin ang) (cos ang)))

(defun SolarAltitudeAtTime (lat dec hour / lat_r dec_r ha_r alt_r) 
  (setq lat_r (* lat (/ pi 180.0)) 
        dec_r (* dec (/ pi 180.0)) 
        ha_r (* (- hour 12.0) 15.0 (/ pi 180.0))) 
  (/ (* (asin (+ (* (sin lat_r) (sin dec_r)) (* (cos lat_r) (cos dec_r) (cos ha_r)))) 180.0) pi))

;; --- MAIN COMMAND ---

(defun c:GenerateLayout (/ *error* old_osmode old_cmdecho p_w p_h p_watt lat lon az set_off 
                           mod_in_row mod_in_stack m_gap_v m_gap_h t_gap_h table_w table_h 
                           table_h_proj table_rise row_gap row_pitch ent bmin bmax min_pt max_pt
                           cur_x cur_y panel_count tilt d2r solar_alt_design results xdata_list
                           table_count p_ori actual_w actual_h target_mw target_mods 
                           capacity_mode summary_rows energy_rows table_block_name boundary_handle
                           h_road_w h_road_freq v_road_w v_road_freq row_cnt table_in_row_cnt
                           pvgis_yield row_placed poly_area inner_polys current_mod_row temp_w
                           table_list table_entry total_mid_clamps total_end_clamps placed_this_pos)
  
  (setq old_osmode (getvar "OSMODE")
        old_cmdecho (getvar "CMDECHO"))
  
  (defun *error* (msg)
    (if (numberp old_osmode) (setvar "OSMODE" old_osmode))
    (if (numberp old_cmdecho) (setvar "CMDECHO" old_cmdecho))
    (if (and msg (/= msg "Function cancelled")) (princ (strcat "\nError: " msg)))
    (princ))

  ;; 1. User Inputs
  (initget "TargetMWp Maximum")
  (setq capacity_mode (getkword "\nCapacity Mode [TargetMWp/Maximum] <TargetMWp>: "))
  (if (null capacity_mode) (setq capacity_mode "TargetMWp"))
  (setq target_mw (if (= capacity_mode "Maximum") 9999.0 (getreal "\nEnter Target Capacity in MWp: ")))

  ;; 2. Site Inputs
  (setq p_w (getdist "\nModule WIDTH (m): ")
        p_h (getdist "\nModule HEIGHT (m): ")
        p_watt (getreal "\nModule Wattage (Wp): ")
        lat (getreal "\nLatitude: ")
        lon (getreal "\nLongitude: ")
        az (getreal "\nAzimuth (0=South): ")
        set_off (getdist "\nBoundary Set-off (m): "))

  (setq h_road_w (getdist "\nHorizontal Road Width (m): ")
        h_road_freq (getint "\nHorizontal Road Frequency (Every N rows): ")
        v_road_w (getdist "\nVertical Road Width (m): ")
        v_road_freq (getint "\nVertical Road Frequency (Every N tables): "))

  (setq target_mods (fix (/ (* target_mw 1000000.0) p_watt)))

  (initget "Portrait Landscape")
  (setq p_ori (getkword "\nOrientation [Portrait/Landscape] <Portrait>: "))
  (if (null p_ori) (setq p_ori "Portrait"))
  (setq actual_w (if (= p_ori "Portrait") p_w p_h)
        actual_h (if (= p_ori "Portrait") p_h p_w))

  ;; 3. Table Config
  (setq mod_in_row (getint "\nMAXIMUM Modules per ROW in Table: ")
        mod_in_stack (getint "\nModules per STACK in Table: ")
        m_gap_v (getdist "\nGap between stacked module rows (m): ")
        m_gap_h (getdist "\nGap between stacked module columns (m): ")
        t_gap_h (getdist "\nGap between adjacent TABLES (m): "))
  
  (setq tilt lat d2r (/ pi 180.0))
  (setq table_h (+ (* actual_h mod_in_stack) (* m_gap_v (- mod_in_stack 1))))
  
  ;; FIX: Call to helper defined above
  (setq solar_alt_design (SolarAltitudeAtTime lat -23.45 9.5))
  
  (setq table_rise (* table_h (sin (* tilt d2r))))
  (setq table_h_proj (* table_h (cos (* tilt d2r))))
  (setq row_gap (/ table_rise (tan_lsp (* solar_alt_design d2r))))
  (setq row_pitch (+ table_h_proj row_gap))

  ;; 4. PVGIS
  (princ "\nConnecting to PVGIS 5.2 API...")
  (setq pvgis_yield (GetPVGISData lat lon tilt az))

  ;; 5. Placement & BOM Logic
  (setq ent (car (entsel "\nSelect Main Boundary Polyline: ")))
  (if (and ent (= (cdr (assoc 0 (entget ent))) "LWPOLYLINE"))
    (progn
      (setq inner_polys (CollectInnerPolys ent))
      (EnsureModuleLayer)
      (DefineModuleBlock actual_w actual_h tilt)
      (setq boundary_handle (cdr (assoc 5 (entget ent))))
      (setq poly_area (/ (vla-get-area (vlax-ename->vla-object ent)) 4046.86))
      
      (setq table_list nil 
            total_mid_clamps 0 
            total_end_clamps 0) 

      (TagBoundaryWithData ent p_w p_h p_watt tilt lat lon az mod_in_row mod_in_stack p_ori m_gap_h m_gap_v)
      (vla-getboundingbox (vlax-ename->vla-object ent) 'min_pt 'max_pt)
      (setq bmin (vlax-safearray->list min_pt) bmax (vlax-safearray->list max_pt)
            panel_count 0 table_count 0 row_cnt 0
            cur_y (+ (cadr bmin) set_off))

      (setvar "OSMODE" 0) (setvar "CMDECHO" 0)

      (while (and (<= (+ cur_y table_h_proj) (- (cadr bmax) set_off))
                  (< panel_count target_mods))
        (if (and (> h_road_freq 0) (> row_cnt 0) (= (rem row_cnt h_road_freq) 0))
            (setq cur_y (+ cur_y h_road_w)))
        (setq cur_x (+ (car bmin) set_off) table_in_row_cnt 0 row_placed nil)
        (while (and (< panel_count target_mods) (< cur_x (- (car bmax) set_off)))
          (if (and (> v_road_freq 0) (> table_in_row_cnt 0) (= (rem table_in_row_cnt v_road_freq) 0))
              (setq cur_x (+ cur_x v_road_w)))
          (setq current_mod_row mod_in_row placed_this_pos nil)
          (while (and (> current_mod_row 0) (not placed_this_pos))
            (setq temp_w (+ (* actual_w current_mod_row) (* m_gap_h (- current_mod_row 1))))
            (if (and (<= (+ cur_x temp_w) (- (car bmax) set_off))
                     (TablePlacementOk cur_x cur_y temp_w table_h_proj ent set_off)
                     (not (IsInsideAnyPoly (list cur_x cur_y) temp_w table_h_proj inner_polys)))
                (progn
                  (setq table_block_name (BuildTableBlockName current_mod_row mod_in_stack p_ori actual_w actual_h m_gap_h m_gap_v tilt))
                  (DefineTableBlock table_block_name current_mod_row mod_in_stack actual_w actual_h m_gap_h m_gap_v tilt)
                  (InsertTableBlock table_block_name (list cur_x cur_y 0.0))
                  
                  (setq total_end_clamps (+ total_end_clamps (* 2 2 mod_in_stack))) 
                  (if (> current_mod_row 1)
                      (setq total_mid_clamps (+ total_mid_clamps (* (- current_mod_row 1) 2 mod_in_stack))))

                  (setq table_entry (assoc current_mod_row table_list))
                  (if table_entry
                      (setq table_list (subst (cons current_mod_row (1+ (cdr table_entry))) table_entry table_list))
                      (setq table_list (cons (cons current_mod_row 1) table_list)))

                  (setq panel_count (+ panel_count (* current_mod_row mod_in_stack))
                        table_count (1+ table_count)
                        table_in_row_cnt (1+ table_in_row_cnt)
                        row_placed T placed_this_pos T
                        cur_x (+ cur_x temp_w t_gap_h)))
                (setq current_mod_row (1- current_mod_row))))
          (if (not placed_this_pos) (setq cur_x (+ cur_x actual_w t_gap_h))))
        (if row_placed (setq row_cnt (1+ row_cnt)))
        (setq cur_y (+ cur_y row_pitch)))

      ;; 6. Reporting
      (setq results (CalculateProduction panel_count p_watt pvgis_yield))
      (setq summary_rows
            (list
              (list "Boundary Area" (strcat (rtos poly_area 2 3) " Acres"))
              (list "Total Modules" (itoa panel_count))
              (list "System Capacity" (strcat (rtos (nth 0 results) 2 3) " MWp"))
              (list "Total Tables" (itoa table_count))
              (list "End Clamps (Qty)" (itoa total_end_clamps))
              (list "Mid Clamps (Qty)" (itoa total_mid_clamps))))
      
      (setq table_list (vl-sort table_list (function (lambda (a b) (> (car a) (car b))))))
      (foreach item table_list
        (setq summary_rows (append summary_rows (list (list (strcat "Table " (itoa (car item)) "x" (itoa mod_in_stack)) (itoa (cdr item)))))))

      (setq summary_rows (append summary_rows (list (list "Orientation" p_ori) (list "Tilt Angle" (strcat (rtos tilt 2 1) " deg")) (list "Location" (strcat (rtos lat 2 3) ", " (rtos lon 2 3))))))
      (setq energy_rows (list (list "Annual Energy" (strcat (rtos (nth 1 results) 2 0) " kWh")) (list "Monthly Energy" (strcat (rtos (/ (nth 1 results) 12.0) 2 0) " kWh")) (list "Daily Gen" (strcat (rtos (nth 2 results) 2 2) " kWh")) (list "Specific Yield" (strcat (rtos (nth 3 results) 2 3) " kWh/kWp/day"))))

      (DeleteReportEntities boundary_handle)
      (DrawReportTables ent summary_rows energy_rows boundary_handle)
      (princ (strcat "\nSuccess: " (itoa panel_count) " Modules placed."))
    ))
  (setvar "OSMODE" old_osmode)
  (princ)
)

;;; --- GEOMETRY & UTILITIES ---

(defun TablePlacementOk (x y w h_proj ent soff / corners ok)
  (setq corners (list (list x y) (list (+ x w) y) (list (+ x w) (+ y h_proj)) (list x (+ y h_proj))) ok T)
  (foreach pt corners (if (or (not (InsidePoly pt ent)) (< (MinDistToPoly pt ent) (* soff 0.99))) (setq ok nil))) ok)

(defun MinDistToPoly (pt ent / verts d_min i p1 p2 d_temp)
  (setq verts (get-poly-approx-vertices ent) verts (append verts (list (car verts))) d_min 1e12 i 0)
  (while (< i (1- (length verts))) (setq p1 (nth i verts) p2 (nth (1+ i) verts)) (setq d_temp (DistToSegment pt p1 p2)) (if (< d_temp d_min) (setq d_min d_temp)) (setq i (1+ i))) d_min)

(defun DistToSegment (p a b / L2 t_val proj)
  (setq L2 (distance a b)) (if (< L2 1e-6) (distance p a) (progn (setq t_val (/ (+ (* (- (car p) (car a)) (- (car b) (car a))) (* (- (cadr p) (cadr a)) (- (cadr b) (cadr a)))) (* L2 L2))) (setq t_val (max 0.0 (min 1.0 t_val))) (distance p (list (+ (car a) (* t_val (- (car b) (car a)))) (+ (cadr a) (* t_val (- (cadr b) (cadr a)))))))))

(defun InsidePoly (pt ent / vertices x y count p1 p2) 
  (setq vertices (get-poly-approx-vertices ent) x (car pt) y (cadr pt) count 0 vertices (append vertices (list (car vertices))))
  (repeat (1- (length vertices)) (setq p1 (car vertices) p2 (cadr vertices) vertices (cdr vertices)) (if (and (or (and (<= (cadr p1) y) (< y (cadr p2))) (and (<= (cadr p2) y) (< y (cadr p1)))) (< x (+ (car p1) (/ (* (- y (cadr p1)) (- (car p2) (car p1))) (- (cadr p2) (cadr p1)))))) (setq count (1+ count)))) (= (rem count 2) 1))

(defun CollectInnerPolys (main_ent / ss idx ename inner)
  (setq inner nil) (if (setq ss (ssget "_X" '((0 . "LWPOLYLINE")))) (progn (setq idx 0) (while (< idx (sslength ss)) (setq ename (ssname ss idx)) (if (and (/= ename main_ent) (InsidePoly (car (get-poly-approx-vertices ename)) main_ent)) (setq inner (cons ename inner))) (setq idx (1+ idx))))) inner)

(defun IsInsideAnyPoly (pt w h_proj poly_list / hit corners)
  (setq hit nil corners (list pt (list (+ (car pt) w) (cadr pt)) (list (+ (car pt) w) (+ (cadr pt) h_proj)) (list (car pt) (+ (cadr pt) h_proj)))) (foreach poly poly_list (foreach c corners (if (InsidePoly c poly) (setq hit T)))) hit)

;;; --- BLOCK & TAGGING ---

(defun TagBoundaryWithData (ent pw ph watt tilt lat lon az row stk ori mgh mgv)
  (if (not (tblsearch "APPID" "FS_SOLAR_DATA")) (regapp "FS_SOLAR_DATA"))
  (entmod (append (entget ent) (list (list -3 (list "FS_SOLAR_DATA" (cons 1040 pw) (cons 1040 ph) (cons 1040 watt) (cons 1040 tilt) (cons 1040 lat) (cons 1040 lon) (cons 1040 az) (cons 1040 (float row)) (cons 1040 (float stk)) (cons 1040 (if (= ori "Portrait") 1.0 2.0)) (cons 1040 mgh) (cons 1040 mgv)))))))

(defun GetPVGISData (lat lon tilt az / url http val start_idx search_txt)
  (setq url (strcat "https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?lat=" (rtos lat 2 3) "&lon=" (rtos lon 2 3) "&peakpower=1&loss=14&mountingplace=free&angle=" (rtos tilt 2 0) "&aspect=" (rtos az 2 0) "&outputformat=json"))
  (setq http (vlax-create-object "Microsoft.XMLHTTP")) (vlax-invoke-method http 'open "GET" url :vlax-false) (vlax-invoke-method http 'send) (setq val (vlax-get-property http 'responseText)) (vlax-release-object http) (setq search_txt "\"E_d\":")
  (if (setq start_idx (vl-string-search search_txt val)) (atof (substr val (+ start_idx (strlen search_txt) 1) 5)) 4.5))

(defun get-poly-approx-vertices (ent / data pts) (setq data (entget ent)) (foreach item data (if (= (car item) 10) (setq pts (cons (cdr item) pts)))) (reverse pts))

(defun BuildTableBlockName (cols rows ori w h gap_h gap_v tilt) (strcat "table_" (itoa cols) "x" (itoa rows) "_" (if (= ori "Portrait") "P" "L") "_" (rtos (* tilt 10) 2 0)))

;; FIX: Stripped unnecessary escape slashes causing "extra cdrs" error
(defun DefineModuleBlock (w h tilt / d2r h_proj h_rise) 
  (setq d2r (/ pi 180.0) h_proj (* h (cos (* tilt d2r))) h_rise (* h (sin (* tilt d2r)))) 
  (if (not (tblsearch "BLOCK" "module")) 
    (progn 
      (entmake (list '(0 . "BLOCK") '(2 . "module") '(70 . 0) '(10 0.0 0.0 0.0))) 
      (entmake (list '(0 . "LWPOLYLINE") '(100 . "AcDbEntity") '(8 . "module") '(62 . 256) '(100 . "AcDbPolyline") '(90 . 4) '(70 . 1) (cons 10 (list 0.0 0.0)) (cons 10 (list w 0.0)) (cons 10 (list w h_proj)) (cons 10 (list 0.0 h_proj)))) 
      (entmake (list '(0 . "ENDBLK"))))))

(defun DefineTableBlock (block_name cols rows w h gap_h gap_v tilt / r c m_x m_y d2r_val) 
  (if (not (tblsearch "BLOCK" block_name)) 
    (progn 
      (setq d2r_val (/ pi 180.0)) 
      (entmake (list '(0 . "BLOCK") (cons 2 block_name) '(70 . 0) '(10 0.0 0.0 0.0))) 
      (setq r 0) 
      (while (< r rows) 
        (setq c 0) 
        (while (< c cols) 
          (setq m_x (* c (+ w gap_h)) m_y (* r (+ (* h (cos (* tilt d2r_val))) gap_v))) 
          (entmake (list '(0 . "INSERT") '(2 . "module") (cons 10 (list m_x m_y 0)) '(41 . 1.0) '(42 . 1.0) '(43 . 1.0))) 
          (setq c (1+ c))) 
        (setq r (1+ r))) 
      (entmake (list '(0 . "ENDBLK"))))))

(defun InsertTableBlock (block_name ins_pt) (entmake (list '(0 . "INSERT") (cons 2 block_name) (cons 10 ins_pt) '(41 . 1.0) '(42 . 1.0) '(43 . 1.0))))

(defun EnsureModuleLayer () (if (not (tblsearch "LAYER" "module")) (entmake (list '(0 . "LAYER") '(100 . "AcDbSymbolTableRecord") '(100 . "AcDbLayerTableRecord") '(2 . "module") '(70 . 0) '(62 . 5))) (command "_.LAYER" "_Color" "5" "module" "")))

(defun CalculateProduction (count watt yield / cap_kw cap_mw daily annual) (setq cap_kw (/ (* count watt) 1000.0) cap_mw (/ cap_kw 1000.0) daily (* cap_kw yield) annual (* daily 365.0)) (list cap_mw annual daily yield))

(defun DrawReportTables (ent summary_rows energy_rows boundary_handle / metrics base_pt next_y table_gap before_ent e entity_list grp_name doc groups grp) (EnsureReportTextStyle) (setq metrics (GetReportMetrics ent) base_pt (nth 0 metrics) table_gap (nth 8 metrics)) (setq before_ent (entlast)) (setq next_y (DrawReportTable (car base_pt) (cadr base_pt) "LAYOUT SUMMARY" summary_rows boundary_handle metrics)) (DrawReportTable (car base_pt) (- next_y table_gap) "ENERGY SUMMARY (PVGIS)" energy_rows boundary_handle metrics) (setq entity_list nil e (if before_ent (entnext before_ent) (entnext))) (while e (setq entity_list (cons e entity_list)) (setq e (entnext e))) (if entity_list (progn (setq grp_name (strcat "SRPT_" boundary_handle) doc (vla-get-activedocument (vlax-get-acad-object)) groups (vla-get-groups doc)) (vl-catch-all-apply (function (lambda () (vla-delete (vla-item groups grp_name))))) (setq grp (vla-add groups grp_name)) (foreach e entity_list (vl-catch-all-apply (function (lambda () (vla-appenditem grp (vlax-ename->vla-object e)))))))))

(defun DrawReportTable (x y title rows boundary_handle metrics / row_h text_h sno_w details_w data_w total_w total_h y_bottom cur_y idx pad_x pad_y) (setq row_h (nth 1 metrics) text_h (nth 2 metrics) sno_w (nth 3 metrics) details_w (nth 4 metrics) data_w (nth 5 metrics) pad_x (max 1.0 (* text_h 0.5)) pad_y (max 0.8 (* text_h 0.5)) total_w (+ sno_w details_w data_w) total_h (* row_h (+ 1 (length rows))) y_bottom (- y total_h)) (DrawReportMText (list x (+ y (nth 7 metrics)) 0.0) total_w title (nth 6 metrics) 13158701 boundary_handle) (DrawReportLine (list x y 0.0) (list (+ x total_w) y 0.0) boundary_handle) (DrawReportLine (list x y_bottom 0.0) (list (+ x total_w) y_bottom 0.0) boundary_handle) (DrawReportLine (list x y 0.0) (list x y_bottom 0.0) boundary_handle) (DrawReportLine (list (+ x total_w) y 0.0) (list (+ x total_w) y_bottom 0.0) boundary_handle) (setq idx 1 cur_y (- y row_h)) (foreach row rows (DrawReportMText (list (+ x pad_x) (- cur_y pad_y) 0.0) sno_w (itoa idx) text_h 13158701 boundary_handle) (DrawReportMText (list (+ x sno_w pad_x) (- cur_y pad_y) 0.0) details_w (car row) text_h 13158701 boundary_handle) (DrawReportMText (list (+ x sno_w details_w pad_x) (- cur_y pad_y) 0.0) data_w (cadr row) text_h 13158701 boundary_handle) (DrawReportLine (list x cur_y 0.0) (list (+ x total_w) cur_y 0.0) boundary_handle) (setq idx (1+ idx) cur_y (- cur_y row_h))) y_bottom)

(defun GetReportMetrics (ent / min_pt max_pt bmin bmax bw bh ref_dim scale row_h text_h sno_w details_w data_w title_h title_gap table_gap report_offset x y) (vla-getboundingbox (vlax-ename->vla-object ent) 'min_pt 'max_pt) (setq bmin (vlax-safearray->list min_pt) bmax (vlax-safearray->list max_pt) bw (- (car bmax) (car bmin)) bh (- (cadr bmax) (cadr bmin)) ref_dim (min bw bh) scale (max 0.35 (min 2.0 (/ ref_dim 120.0))) row_h (* 10.0 scale) text_h (* 4.0 scale) sno_w (* 16.0 scale) details_w (* 72.0 scale) data_w (* 92.0 scale) title_h (* 5.0 scale) title_gap (* 8.0 scale) table_gap (* 16.0 scale) x (car bmin) y (- (cadr bmin) (* 15.0 scale))) (list (list x y 0.0) row_h text_h sno_w details_w data_w title_h title_gap table_gap))

(defun DrawReportLine (p1 p2 boundary_handle / ename) (setq ename (entmakex (list '(0 . "LINE") '(420 . 13158701) (cons 10 p1) (cons 11 p2)))) (TagReportEntity ename boundary_handle))

(defun DrawReportMText (pt width txt h true_color boundary_handle / ename) (setq ename (entmakex (list '(0 . "MTEXT") '(100 . "AcDbEntity") (cons 420 true_color) '(100 . "AcDbMText") (cons 10 pt) (cons 40 h) (cons 41 width) '(71 . 1) '(7 . "REPORT_STD") (cons 1 txt)))) (TagReportEntity ename boundary_handle))

(defun TagReportEntity (ename boundary_handle / data) (if (not (tblsearch "APPID" "FS_SOLAR_REPORT")) (regapp "FS_SOLAR_REPORT")) (entmod (append (entget ename) (list (list -3 (list "FS_SOLAR_REPORT" (cons 1000 boundary_handle)))))))

(defun DeleteReportEntities (boundary_handle / ss idx ename xdata) (if (setq ss (ssget "_X" '((0 . "LINE,MTEXT")))) (progn (setq idx 0) (while (< idx (sslength ss)) (setq ename (ssname ss idx) xdata (cdr (assoc -3 (entget ename '("FS_SOLAR_REPORT"))))) (if (and xdata (= (cdr (assoc 1000 (cdar xdata))) boundary_handle)) (entdel ename)) (setq idx (1+ idx))))))

(defun EnsureReportTextStyle () (if (not (tblsearch "STYLE" "REPORT_STD")) (entmake (list '(0 . "STYLE") '(100 . "AcDbSymbolTableRecord") '(100 . "AcDbTextStyleTableRecord") '(2 . "REPORT_STD") '(70 . 0) '(40 . 0.0) '(41 . 1.0) '(50 . 0.0) '(71 . 0) '(42 . 2.5) '(3 . "calibril.ttf") '(4 . "")))))

(princ "\nSolarPro Rev-5.8.1 Loaded (Fix: Extra CDRs & Func Definition). Run 'GenerateLayout'.")
(princ)