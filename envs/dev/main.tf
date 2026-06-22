locals {
  name_prefix = "${var.project}-${var.environment}"

  default_tags = merge(var.default_tags, {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
    Repository  = "Byeongwook-Heo/Hashicorp-"
  })
}

module "network" {
  source = "../../modules/network"

  name_prefix              = local.name_prefix
  vpc_cidr                 = var.vpc_cidr
  azs                      = var.azs
  public_subnet_cidrs      = var.public_subnet_cidrs
  app_private_subnet_cidrs = var.app_private_subnet_cidrs
  db_private_subnet_cidrs  = var.db_private_subnet_cidrs
  create_nat_gateways      = var.create_nat_gateways
  tags                     = local.default_tags
}

module "iam" {
  source = "../../modules/iam"

  name_prefix = local.name_prefix
  tags        = local.default_tags
}

module "security" {
  source = "../../modules/security"

  name_prefix           = local.name_prefix
  vpc_id                = module.network.vpc_id
  app_port              = var.app_port
  db_port               = var.db_port
  allowed_http_cidrs    = var.allowed_http_cidrs
  allow_app_egress      = true
  allow_database_egress = false
  tags                  = local.default_tags
}

module "alb" {
  source = "../../modules/alb"

  name_prefix        = local.name_prefix
  vpc_id             = module.network.vpc_id
  public_subnet_ids  = module.network.public_subnet_ids
  security_group_ids = [module.security.alb_security_group_id]
  app_port           = var.app_port
  health_check_path  = var.health_check_path
  tags               = local.default_tags
}

module "compute" {
  source = "../../modules/compute"

  name_prefix               = local.name_prefix
  ami_id                    = var.ami_id
  instance_type             = var.app_instance_type
  key_name                  = var.key_name
  subnet_ids                = module.network.app_private_subnet_ids
  security_group_ids        = [module.security.app_security_group_id]
  iam_instance_profile_name = module.iam.instance_profile_name
  target_group_arns         = [module.alb.target_group_arn]
  desired_capacity          = var.app_desired_capacity
  min_size                  = var.app_min_size
  max_size                  = var.app_max_size
  root_volume_size          = var.app_root_volume_size
  user_data = templatefile("${path.module}/user_data/app.sh", {
    app_port    = var.app_port
    environment = var.environment
  })
  tags = local.default_tags
}

module "data" {
  source = "../../modules/data"

  name_prefix            = local.name_prefix
  subnet_ids             = module.network.db_private_subnet_ids
  security_group_ids     = [module.security.db_security_group_id]
  db_name                = var.db_name
  db_username            = var.db_username
  db_instance_class      = var.db_instance_class
  allocated_storage      = var.db_allocated_storage
  max_allocated_storage  = var.db_max_allocated_storage
  engine_version         = var.db_engine_version
  parameter_group_family = var.db_parameter_group_family
  multi_az               = var.db_multi_az
  deletion_protection    = var.db_deletion_protection
  skip_final_snapshot    = var.db_skip_final_snapshot
  tags                   = local.default_tags
}

